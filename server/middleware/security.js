// Security response headers: MIME-sniffing protection and a restrictive
// Content-Security-Policy. Applied to every response.
//
// Deliberately no X-Frame-Options / CSP frame-ancestors: Home Assistant renders
// add-ons through its ingress proxy inside an iframe on the HA origin, which
// varies per install (homeassistant.local:8123, a Nabu Casa URL, a bare IP), so
// there is no origin to allowlist. Sending either header makes the app render
// blank under ingress. Anti-clickjacking is traded for embeddability here.
export function securityHeaders(req, res, next) {
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'none';"
  );

  // Remove server info
  res.removeHeader('X-Powered-By');

  next();
}
