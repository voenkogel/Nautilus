import React, { useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Classes for the modal panel (defaults to a standard white card). */
  containerClassName?: string;
  zIndexClassName?: string;
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  /**
   * 'center' (default) is a centered dialog; 'sheet' slides up from the bottom
   * edge with a drag-to-dismiss grabber. Pair 'sheet' with useAnimatedClose so
   * closing plays the exit animation.
   */
  variant?: 'center' | 'sheet';
  /** Sheet only: plays the exit animation (from useAnimatedClose). */
  closing?: boolean;
  /** Sheet only: called when the sheet is dragged down. Defaults to onClose. */
  onDismiss?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

/** Drag distance (px) or release velocity (px/ms) that dismisses a sheet. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

/**
 * Shared modal shell: standardized backdrop (dim + blur), Escape-to-close,
 * click-outside-to-close, ARIA, and a focus trap. Components render only their
 * panel content as children.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  containerClassName = 'bg-surface rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden',
  zIndexClassName = 'z-50',
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  variant = 'center',
  closing = false,
  onDismiss,
  onKeyDown,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);
  useFocusTrap(ref, isOpen);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  const isSheet = variant === 'sheet';

  // Drag the grabber to pull the sheet down; release past the threshold (or
  // with a flick) to dismiss, otherwise it springs back. Styles are written
  // straight to the panel so dragging never re-renders the content.
  const onGrabStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closing || !ref.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startT: performance.now(), dy: 0 };
    ref.current.style.transition = 'none';
  };
  const onGrabMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.startY);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onGrabEnd = () => {
    const d = drag.current;
    const panel = ref.current;
    drag.current = null;
    if (!d || !panel) return;
    const velocity = d.dy / Math.max(1, performance.now() - d.startT);
    if (d.dy > DISMISS_DISTANCE || (d.dy > 24 && velocity > DISMISS_VELOCITY)) {
      (onDismiss ?? onClose)();
    } else {
      panel.style.transition = 'transform .28s cubic-bezier(.2, .8, .2, 1)';
      panel.style.transform = '';
    }
  };

  return (
    <div
      className={isSheet
        ? `sheet-layer fixed inset-0 ${zIndexClassName}${closing ? ' is-closing' : ''}`
        : `dialog-layer fixed inset-0 ${zIndexClassName} flex items-center justify-center`}
    >
      <div
        className={isSheet ? 'sheet-scrim' : 'dialog-scrim absolute inset-0 bg-black/50 backdrop-blur-sm'}
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onKeyDown={onKeyDown}
        className={`relative ${isSheet ? 'sheet-panel' : 'dialog-panel'} ${containerClassName}`}
      >
        {isSheet && (
          <div
            className="sheet-handle"
            onPointerDown={onGrabStart}
            onPointerMove={onGrabMove}
            onPointerUp={onGrabEnd}
            onPointerCancel={onGrabEnd}
            aria-hidden="true"
          />
        )}
        {children}
      </div>
    </div>
  );
};

export default Modal;
