// Admin credential store.
//
// Credentials changed from the UI are persisted as a scrypt hash in
// credentials.json (next to config.json, or in NAUTILUS_DATA_DIR). When that
// file is absent, the NAUTILUS_ADMIN_USERNAME / NAUTILUS_ADMIN_PASSWORD env
// vars are the source of truth (first boot). Once the file exists it wins over
// the env vars; set NAUTILUS_RESET_CREDENTIALS=true to discard it and fall back
// to the env vars again (recovery path for a forgotten password).
import crypto from 'crypto';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, chmodSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const scrypt = promisify(crypto.scrypt);

// OWASP-recommended scrypt cost (N=2^17 needs 128 MiB; 2^15 keeps memory at
// 32 MiB so a burst of logins can't exhaust a small LXC).
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const scryptOpts = (p) => ({ N: p.N, r: p.r, p: p.p, maxmem: 128 * p.N * p.r + 1024 * 1024 });

export const USERNAME_MAX = 64;
export const PASSWORD_MIN = 12;
// Upper bound keeps attacker-supplied input from making scrypt do extra work.
export const PASSWORD_MAX = 256;

const INSECURE_PASSWORDS = new Set(['1234', 'admin', 'password', 'changeme', 'changeme_use_strong_password_here']);

let current = null; // { username, hash: Buffer, salt: Buffer, params, source }
let credentialsPath = null;

async function hashPassword(password, salt = crypto.randomBytes(16), params = SCRYPT_PARAMS) {
  const hash = await scrypt(String(password), salt, params.keylen, scryptOpts(params));
  return { hash, salt, params };
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Returns null if valid, or a human-readable reason it isn't.
export function validateUsername(username) {
  if (typeof username !== 'string') return 'Username must be a string';
  const u = username.trim();
  if (u.length === 0) return 'Username cannot be empty';
  if (u.length > USERNAME_MAX) return `Username must be at most ${USERNAME_MAX} characters`;
  if (/[\u0000-\u001f\u007f]/.test(u)) return 'Username contains invalid characters';
  return null;
}

export function validateNewPassword(password, username) {
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (INSECURE_PASSWORDS.has(password.toLowerCase())) return 'That password is too common';
  if (username && password.toLowerCase() === String(username).trim().toLowerCase()) {
    return 'Password must not equal the username';
  }
  if (new Set(password).size < 4) return 'Password is too repetitive';
  return null;
}

function writeAtomic(path, data) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch { /* no POSIX perms (Windows) */ }
}

function loadFromFile(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (raw?.version !== 1 || typeof raw.username !== 'string' || !raw.hash || !raw.salt || !raw.params) {
    throw new Error('unrecognised credentials file format');
  }
  return {
    username: raw.username,
    hash: Buffer.from(raw.hash, 'base64'),
    salt: Buffer.from(raw.salt, 'base64'),
    params: raw.params,
    source: 'file',
  };
}

/**
 * Initialise the store. `configPath` is where config.json lives; the credentials
 * file sits beside it unless NAUTILUS_DATA_DIR is set. Exits the process if no
 * usable credentials can be established (no file and no secure env password).
 */
export async function initCredentials(configPath) {
  credentialsPath = process.env.NAUTILUS_DATA_DIR
    ? join(process.env.NAUTILUS_DATA_DIR, 'credentials.json')
    : join(dirname(configPath), 'credentials.json');

  if (process.env.NAUTILUS_RESET_CREDENTIALS === 'true' && existsSync(credentialsPath)) {
    try {
      unlinkSync(credentialsPath);
      logger.warn('⚠️  NAUTILUS_RESET_CREDENTIALS=true: stored credentials discarded, using env vars. Remove the flag after logging in.');
    } catch (err) {
      logger.error(`❌ Could not remove ${credentialsPath}: ${err.message}`);
    }
  }

  if (existsSync(credentialsPath)) {
    try {
      current = loadFromFile(credentialsPath);
      logger.info(`🔒 Authentication: using credentials stored in ${credentialsPath} (env vars ignored)`);
      return true;
    } catch (err) {
      logger.error(`❌ Credentials file ${credentialsPath} is unreadable (${err.message}); falling back to env vars`);
    }
  }

  const envUser = (process.env.NAUTILUS_ADMIN_USERNAME || 'admin').trim();
  const envPass = process.env.NAUTILUS_ADMIN_PASSWORD;
  if (!envPass || INSECURE_PASSWORDS.has(envPass.toLowerCase())) return false;
  if (envPass.length < PASSWORD_MIN) {
    logger.warn(`⚠️  NAUTILUS_ADMIN_PASSWORD is shorter than ${PASSWORD_MIN} characters — change it from Settings → Account.`);
  }
  current = { username: envUser, ...(await hashPassword(envPass)), source: 'env' };
  logger.info('🔒 Authentication: using credentials from environment variables');
  return true;
}

export const getUsername = () => current?.username ?? null;
export const getCredentialSource = () => current?.source ?? null;

/**
 * Constant-time-ish verification. The password is always hashed (even when the
 * username is wrong) so response timing doesn't reveal valid usernames.
 */
export async function verifyCredentials(username, password) {
  if (!current) return false;
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username.length > USERNAME_MAX * 4 || password.length > PASSWORD_MAX) return false;
  const { hash } = await hashPassword(password, current.salt, current.params);
  const passOk = crypto.timingSafeEqual(hash, current.hash);
  const userOk = crypto.timingSafeEqual(sha(username.trim()), sha(current.username));
  return passOk && userOk;
}

export async function verifyPassword(password) {
  if (!current || typeof password !== 'string' || password.length > PASSWORD_MAX) return false;
  const { hash } = await hashPassword(password, current.salt, current.params);
  return crypto.timingSafeEqual(hash, current.hash);
}

/** Persist new credentials. Either field may be omitted to keep the current one. */
export async function updateCredentials({ username, password }) {
  if (!current || !credentialsPath) throw new Error('Credential store not initialised');
  const nextUser = username !== undefined ? username.trim() : current.username;
  const next = password !== undefined
    ? { username: nextUser, ...(await hashPassword(password)) }
    : { username: nextUser, hash: current.hash, salt: current.salt, params: current.params };

  writeAtomic(credentialsPath, JSON.stringify({
    version: 1,
    username: next.username,
    algorithm: 'scrypt',
    params: next.params,
    salt: next.salt.toString('base64'),
    hash: next.hash.toString('base64'),
    updatedAt: new Date().toISOString(),
  }, null, 2));

  current = { ...next, source: 'file' };
  logger.info(`🔒 Admin credentials updated (${username !== undefined ? 'username' : ''}${username !== undefined && password !== undefined ? ' + ' : ''}${password !== undefined ? 'password' : ''})`);
}
