import { useState, useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, requireSafeguard = false }) {
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(null);
  const openedAtRef = useRef(0);

  // Track when the dialog opened; reset state
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      setConfirmText('');
      // Focus cancel button (or safeguard input) after a brief delay
      const timer = setTimeout(() => {
        if (requireSafeguard) {
          inputRef.current?.focus();
        } else {
          cancelRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, requireSafeguard]);

  // Guard: block confirm if dialog opened less than 400ms ago
  const canConfirm = () => {
    if (requireSafeguard && confirmText.trim() !== 'DELETE') return false;
    return Date.now() - openedAtRef.current > 400;
  };

  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!canConfirm() || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } catch {
      /* caller handles errors; close dialog regardless */
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || 'Confirm deletion'}>
      <div className="confirm-card" onClick={(e) => e.stopPropagation()}>
        {/* Warning icon */}
        <div className="confirm-icon-ring">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>

        {/* Title */}
        <h3 className="confirm-title">{title || 'Confirm Deletion'}</h3>

        {/* Message */}
        <p className="confirm-message">
          {message || 'This item will be permanently deleted. This cannot be undone.'}
        </p>

        {/* Safeguard input — only for high-impact operations */}
        {requireSafeguard && (
          <div className="confirm-safeguard">
            <label className="confirm-safeguard-label">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              className="confirm-safeguard-input"
              value={confirmText}
              onChange={(e) => {
                const val = e.target.value;
                // Only accept uppercase letters — reject lowercase input
                if (val === '' || /^[A-Z]+$/.test(val)) {
                  setConfirmText(val);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        )}

        {/* Actions */}
        <div className="confirm-actions">
          <button ref={cancelRef} className="confirm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="confirm-btn-delete" onClick={handleConfirm} disabled={loading || (requireSafeguard && confirmText.trim() !== 'DELETE')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            {loading ? 'DELETING...' : 'DELETE'}
          </button>
        </div>
      </div>
    </div>
  );
}
