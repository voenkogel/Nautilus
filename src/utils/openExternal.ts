// Opens a URL outside Nautilus. Normally that is a new browser tab, but inside
// the Home Assistant Companion app (HA ingress iframe) window.open() is silently
// dropped: the app's WebView has no onCreateWindow and returns null. The app does
// hand any top-level navigation to another host to the system browser, and
// ingress is same-origin with HA, so navigate window.top instead.
// Bridges: externalAppV2 (current Android, WebMessageListener), externalApp
// (legacy Android) and webkit externalBus (iOS). They only exist in the app, so
// desktop browsers that embed Nautilus via ingress still get a new tab.
type HaWindow = Window & { externalAppV2?: unknown; externalApp?: unknown; webkit?: { messageHandlers?: { externalBus?: unknown } } };

function reachableTop(): HaWindow | null {
  try {
    const top = window.top as HaWindow | null;
    if (!top || top === window) return null;
    void top.location.href; // throws when the parent is cross-origin
    return top;
  } catch {
    return null;
  }
}

export function openExternal(url: string): void {
  const top = reachableTop();
  if (top && (top.externalAppV2 || top.externalApp || top.webkit?.messageHandlers?.externalBus)) {
    top.location.href = url; // HA app opens it in the system browser
    return;
  }
  // No 'noopener' feature: with it window.open always returns null, hiding a dropped popup.
  const opened = window.open(url, '_blank');
  if (opened) { opened.opener = null; return; }
  // Popup refused (e.g. an app WebView whose bridge we don't recognise): navigate the top frame.
  if (top) top.location.href = url;
}
