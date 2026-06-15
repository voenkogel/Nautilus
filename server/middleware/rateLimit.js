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

// 300 requests/min per IP across the public read endpoints — well above normal
// dashboard polling, low enough to blunt scraping/DoS.
export const publicReadLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
