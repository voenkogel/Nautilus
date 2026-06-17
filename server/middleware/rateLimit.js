// Dependency-free in-memory per-IP fixed-window limiter. This is an abuse/DoS
// backstop for the public read endpoints, not a fine-grained quota. For
// internet-exposed deployments the reverse proxy should ALSO rate-limit.
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> { count, resetAt }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hits.entries()) if (now > e.resetAt) hits.delete(ip);
  }, windowMs);
  if (timer.unref) timer.unref();
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || now > e.resetAt) {
      e = { count: 0, resetAt: now + windowMs };
      hits.set(ip, e);
    }
    e.count++;
    if (e.count > max) {
      res.setHeader('Retry-After', Math.ceil((e.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too Many Requests', message: 'Rate limit exceeded' });
    }
    next();
  };
}

// Per-IP cap for the public read endpoints. The default (1000/min) is generous
// enough that many dashboards behind a single NAT or reverse-proxy IP won't be
// throttled during normal polling, yet low enough to blunt scraping/DoS. Tune
// with NAUTILUS_PUBLIC_RATE_LIMIT.
//
// NOTE: per-client limiting only works when req.ip is the real client. Behind a
// reverse proxy, set NAUTILUS_TRUST_PROXY (see server/index.js) — otherwise
// every client is bucketed under the proxy's address and shares this limit.
const PUBLIC_MAX = parseInt(process.env.NAUTILUS_PUBLIC_RATE_LIMIT, 10) || 1000;
export const publicReadLimiter = createRateLimiter({ windowMs: 60_000, max: PUBLIC_MAX });
