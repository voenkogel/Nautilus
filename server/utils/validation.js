// Shared input-validation helpers for untrusted/user-supplied values.
//
// These guard the two places where user input reaches a child process or a
// network target: the ping health check (host) and the network scanner (subnet).
// All checks are allow-list based and reject anything with a leading '-' so a
// value can never be reinterpreted as a command-line flag.

// RFC-1123 hostname (one or more dot-separated labels, each 1-63 chars).
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isValidIPv4(value) {
  const m = String(value).match(IPV4_RE);
  if (!m) return false;
  return m.slice(1).every((o) => Number(o) <= 255);
}

/**
 * Validate a value used as a ping / connection target.
 * Accepts an IPv4 address, a loose IPv6 literal, or an RFC-1123 hostname.
 * Rejects empty values, anything over 255 chars, a leading '-' (flag injection),
 * and anything containing whitespace or shell metacharacters.
 * @returns {boolean}
 */
export function isValidHost(host) {
  if (typeof host !== 'string') return false;
  if (host.length === 0 || host.length > 255) return false;
  if (host.startsWith('-')) return false;
  // No whitespace or shell metacharacters (defence-in-depth; we no longer use a shell).
  if (/[\s;&|`$(){}<>\\'"]/.test(host)) return false;
  if (isValidIPv4(host)) return true;
  // Loose IPv6: hex groups and colons only.
  if (host.includes(':') && /^[0-9a-fA-F:]+$/.test(host)) return true;
  return HOSTNAME_RE.test(host);
}

function isPrivateIPv4Octets([a, b]) {
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

/**
 * Validate a CIDR subnet for the network scanner.
 * - must be a well-formed IPv4 CIDR (a.b.c.d/n)
 * - prefix must be between `minPrefix` and 32 (caps the scan size; /16 => 65k hosts)
 * - the base address must be inside an RFC-1918 private range
 * @param {string} subnet
 * @param {{minPrefix?: number}} [opts]
 * @returns {{valid: true, subnet: string} | {valid: false, error: string}}
 */
export function validateScanSubnet(subnet, { minPrefix = 16 } = {}) {
  if (typeof subnet !== 'string') {
    return { valid: false, error: 'Subnet must be a string' };
  }
  const trimmed = subnet.trim();
  if (trimmed.startsWith('-')) {
    return { valid: false, error: 'Invalid subnet' };
  }
  const m = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) {
    return { valid: false, error: 'Subnet must be IPv4 CIDR notation, e.g. 192.168.1.0/24' };
  }
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  const prefix = Number(m[5]);
  if (octets.some((o) => o > 255)) {
    return { valid: false, error: 'Invalid IPv4 address in subnet' };
  }
  if (prefix < minPrefix || prefix > 32) {
    return { valid: false, error: `Subnet prefix must be between /${minPrefix} and /32` };
  }
  if (!isPrivateIPv4Octets(octets)) {
    return { valid: false, error: 'Only RFC-1918 private ranges may be scanned' };
  }
  return { valid: true, subnet: trimmed };
}
