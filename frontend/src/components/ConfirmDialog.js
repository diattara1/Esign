import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const ConfirmDialog = ({
  isOpen,
  title,
  message,
  secondaryMessage,
  onConfirm,
  onCancel,
  confirmText = 'Confirmer',
  cancelText = 'Annuler'
}) => {
  const dialogRef = useRef(null);
  const previousFocused = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    previousFocused.current = document.activeElement;
    const focusable = dialogRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first && first.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last && last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first && first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocused.current && previousFocused.current.focus();
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel}></div>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-white rounded-lg shadow-lg p-6 z-10 w-full max-w-sm"
      >
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        {message && <p className="mt-2">{message}</p>}
        {secondaryMessage && (
          <p className="mt-2 text-sm text-gray-500">{secondaryMessage}</p>
        )}
        <div className="mt-6 flex justify-end space-x-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
