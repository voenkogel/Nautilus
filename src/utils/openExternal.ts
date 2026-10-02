// Opens a URL outside Nautilus. Normally that is a new browser tab, but inside
// the Home Assistant Companion app (HA ingress iframe) window.open() is silently
// dropped: the app's Android WebView has no onCreateWindow. The app does hand any
// top-level navigation to another host to the system browser, and ingress is
// same-origin with HA, so navigate window.top instead. The externalApp /
// externalBus bridges only exist in the Companion app, so desktop browsers that
// embed Nautilus via ingress still get a new tab.
export function openExternal(url: string): void {
  try {
    const top = window.top as (Window & { externalApp?: unknown; webkit?: { messageHandlers?: { externalBus?: unknown } } }) | null;
    if (top && top !== window && (top.externalApp || top.webkit?.messageHandlers?.externalBus)) {
      top.location.href = url; // HA app opens it in the system browser
      return;
    }
  } catch { /* cross-origin parent: fall through */ }
  window.open(url, '_blank', 'noopener,noreferrer');
}
