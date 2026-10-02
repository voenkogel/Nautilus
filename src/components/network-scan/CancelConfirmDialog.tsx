import React from 'react';

interface CancelConfirmDialogProps {
  /** Keep the current results and dismiss the dialog (also fires on backdrop click). */
  onKeep: () => void;
  /** Discard all scan results and reset. */
  onDiscard: () => void;
}

/** Confirmation shown when the user tries to discard completed scan results. */
export const CancelConfirmDialog: React.FC<CancelConfirmDialogProps> = ({ onKeep, onDiscard }) => (
  <div
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1002]"
    onClick={onKeep}
  >
    <div
      className="bg-surface rounded-lg p-6 max-w-md mx-4 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-lg font-semibold text-ink mb-2">
        Discard Scan Results?
      </h3>
      <p className="text-muted mb-6">
        Are you sure you want to cancel? All scan results will be lost and cannot be recovered.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          className="px-4 py-2 text-muted bg-raised hover:bg-raised rounded font-medium transition-colors"
          onClick={onKeep}
        >
          Keep Results
        </button>
        <button
          className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded font-medium transition-colors"
          onClick={onDiscard}
        >
          Discard Results
        </button>
      </div>
    </div>
  </div>
);

export default CancelConfirmDialog;
