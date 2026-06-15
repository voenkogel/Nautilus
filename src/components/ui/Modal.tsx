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
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

/**
 * Shared modal shell: standardized backdrop (dim + blur), centering, Escape-to-
 * close, click-outside-to-close, ARIA, and a focus trap. Components render only
 * their panel content as children.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  containerClassName = 'bg-white rounded-lg shadow-2xl w-full max-w-md mx-4 overflow-hidden',
  zIndexClassName = 'z-50',
  role = 'dialog',
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center`}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={`relative ${containerClassName}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;
