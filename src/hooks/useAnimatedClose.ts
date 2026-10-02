import { useCallback, useEffect, useRef, useState } from 'react';

/** Matches the .sheet-layer exit animation in design.css. */
const EXIT_MS = 260;

/**
 * Defers `onClose` until a sheet's exit animation has played. Pass
 * `requestClose` to every close path (button, Escape, backdrop, drag) and
 * `closing` to <Modal variant="sheet">.
 */
export function useAnimatedClose(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const requestClose = useCallback(() => {
    if (timer.current !== undefined) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setClosing(false);
      onClose();
    }, EXIT_MS);
  }, [onClose]);

  return { closing, requestClose };
}
