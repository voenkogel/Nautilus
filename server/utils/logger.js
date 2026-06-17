// Minimal leveled logger and single logging choke-point for the server (ARCH-7).
//
// info/warn/error pass straight through to console so the existing (emoji-prefixed)
// output is unchanged. `debug` is gated behind NAUTILUS_DEBUG=1 so verbose
// per-cycle health-check logging can be silenced or enabled without code changes.
// Routing all server logging through one module makes it easy to later add
// timestamps, levels, JSON output, or a transport without touching call sites.

const DEBUG = process.env.NAUTILUS_DEBUG === '1' || process.env.NAUTILUS_DEBUG === 'true';

export const logger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => { if (DEBUG) console.log(...args); },
};
