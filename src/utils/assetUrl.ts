// Resolves an asset path from the config (favicon, logo, background image) to a
// URL that is relative to the page. The app must work under any sub-path — e.g.
// Home Assistant ingress at /api/hassio_ingress/<token>/ — so no URL may start
// with '/'. Existing config.json files still hold root-absolute paths like
// '/nautilusIcon.png'; strip the leading slash from those. Absolute URLs
// (http(s)://) and data: URIs are passed through untouched.
//
// undefined passes through so callers can hand it an optional config value and
// still get a usable `src` (an empty string would re-request the page itself).
export function assetUrl(path: string): string;
export function assetUrl(path: string | undefined): string | undefined;
export function assetUrl(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  return /^(https?:|data:)/i.test(path) ? path : path.replace(/^\/+/, '');
}
