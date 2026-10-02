// Admin credential store.
//
// There is no default login. Until an administrator account exists, the UI
// shows a one-time setup form (POST /api/auth/setup) instead of the login
// prompt. Credentials are persisted as a scrypt hash in credentials.json (next
// to config.json, or in NAUTILUS_DATA_DIR) and can be changed later from
// Settings → Account. Deleting that file, or starting once with
// NAUTILUS_RESET_CREDENTIALS=true, brings the setup form back (recovery path
// for a forgotten password).
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

const INSECURE_PASSWORDS = new Set(['1234', 'admin', 'password', 'changeme', 'nautilus']);

let current = null; // { username, hash: Buffer, salt: Buffer, params }; null until set up
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
  };
}

/**
 * Initialise the store. `configPath` is where config.json lives; the credentials
 * file sits beside it unless NAUTILUS_DATA_DIR is set.
 */
export async function initCredentials(configPath) {
  credentialsPath = process.env.NAUTILUS_DATA_DIR
    ? join(process.env.NAUTILUS_DATA_DIR, 'credentials.json')
    : join(dirname(configPath), 'credentials.json');

  if (process.env.NAUTILUS_RESET_CREDENTIALS === 'true' && existsSync(credentialsPath)) {
    try {
      unlinkSync(credentialsPath);
      logger.warn('⚠️  NAUTILUS_RESET_CREDENTIALS=true: stored credentials discarded. Remove the flag after creating the new account.');
    } catch (err) {
      logger.error(`❌ Could not remove ${credentialsPath}: ${err.message}`);
    }
  }

  if (existsSync(credentialsPath)) {
    try {
      current = loadFromFile(credentialsPath);
      logger.info(`🔒 Authentication: using credentials stored in ${credentialsPath}`);
      return;
    } catch (err) {
      logger.error(`❌ Credentials file ${credentialsPath} is unreadable (${err.message})`);
    }
  }

  logger.warn('⚠️  Authentication: no administrator account yet. Open Nautilus in a browser to create one.');
}

/** True until an administrator account has been created. */
export const isSetupRequired = () => current === null;

export const getUsername = () => current?.username ?? null;

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
  if (!credentialsPath) throw new Error('Credential store not initialised');
  if (!current && (username === undefined || password === undefined)) {
    throw new Error('Both username and password are required for the first account');
  }
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

  current = next;
  logger.info(`🔒 Admin credentials updated (${username !== undefined ? 'username' : ''}${username !== undefined && password !== undefined ? ' + ' : ''}${password !== undefined ? 'password' : ''})`);
}

// Set while the first account is being written, so two setup requests racing
// through the async hash can't both succeed.
let creating = false;

/**
 * Create the first administrator account. Returns false if one already exists
 * (or another request is creating it right now).
 */
export async function createInitialCredentials({ username, password }) {
  if (current || creating) return false;
  creating = true;
  try {
    await updateCredentials({ username, password });
    return true;
  } finally {
    creating = false;
  }
}
