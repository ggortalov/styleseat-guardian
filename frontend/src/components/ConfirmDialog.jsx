import { useState, useEffect, useRef } from 'react';
import './ConfirmDialog.css';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, requireSafeguard = false }) {
  const [confirmText, setConfirmText] = useState('');
  const inputRef = useRef(null);

  // Reset input when dialog opens; auto-focus when opens
  useEffect(() => {
    if (isOpen) {
      setConfirmText('');
      if (requireSafeguard) {
        setTimeout(() => inputRef.current?.focus(), 200);
      }
    }
  }, [isOpen, requireSafeguard]);

  const isConfirmed = requireSafeguard ? confirmText === 'DELETE' : true;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isConfirmed) {
      onConfirm();
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
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck="false"
            />
          </div>
        )}

        {/* Actions */}
        <div className="confirm-actions">
          <button className="confirm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="confirm-btn-delete" onClick={onConfirm} disabled={!isConfirmed}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
