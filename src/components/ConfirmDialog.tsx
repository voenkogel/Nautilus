import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const variantStyles = {
    danger: { icon: 'text-red-500', iconBg: 'bg-red-100', button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500' },
    warning: { icon: 'text-amber-500', iconBg: 'bg-amber-100', button: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' },
    info: { icon: 'text-blue-500', iconBg: 'bg-blue-100', button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500' },
  };
  const styles = variantStyles[variant];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      zIndexClassName="z-[100]"
      role="alertdialog"
      ariaLabelledBy="confirm-dialog-title"
      ariaDescribedBy="confirm-dialog-message"
      containerClassName="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scale-in"
    >
      {/* Content */}
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${styles.iconBg} flex items-center justify-center`}>
            <AlertTriangle className={`w-5 h-5 ${styles.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
              {title}
            </h3>
            <p id="confirm-dialog-message" className="mt-2 text-sm text-gray-600">
              {message}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="primary" className={styles.button} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
