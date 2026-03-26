import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import runService from '../services/runService';
import { playConfirmation, playError } from '../services/soundService';

const ImportContext = createContext(null);

export function ImportProvider({ children }) {
  const [importState, setImportState] = useState('idle'); // idle | submitting | running | done | error | duplicate
  const [importOutput, setImportOutput] = useState('');
  const [importError, setImportError] = useState('');
  const [importQueue, setImportQueue] = useState([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importedRunId, setImportedRunId] = useState(null);
  const pollRef = useRef(null);
  const queueRef = useRef([]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollUntilDone = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await runService.getImportStatus();
        setImportOutput(status.output || '');
        if (!status.running) {
          stopPolling();
          window.__refreshSidebarRuns?.();
          window.__onImportComplete?.();

          if (!status.success && status.exit_code !== 2) {
            setImportState('error');
            setImportError(status.output || 'Import failed. Check server logs.');
            setImportQueue([]);
            queueRef.current = [];
            playError();
            return;
          }

          // Capture the run ID from the completed import
          if (status.run_id) setImportedRunId(status.run_id);

          // Drain the next item from the queue, or finish
          const pending = queueRef.current;
          if (pending.length > 0) {
            const [next, ...rest] = pending;
            queueRef.current = rest;
            setImportQueue(rest);
            setImportOutput('');
            runService.importFromCircleCI(next)
              .then(() => { pollUntilDone(); })
              .catch(() => { pollUntilDone(); });
          } else {
            const finalState = status.exit_code === 2 ? 'duplicate' : 'done';
            setImportState(finalState);
            if (finalState === 'done') playConfirmation();
            if (finalState === 'duplicate') playError();
          }
        }
      } catch {
        stopPolling();
        setImportState('error');
        setImportError('Lost connection while checking import status.');
        playError();
      }
    }, 2000);
  }, [stopPolling]);

  const startImport = useCallback(async (url) => {
    if (!url.trim()) return;
    const trimmed = url.trim();
    if (importState === 'running') {
      queueRef.current = [...queueRef.current, trimmed];
      setImportQueue(queueRef.current);
      return;
    }
    setImportState('submitting');
    setImportError('');
    setImportOutput('');
    setImportedRunId(null);
    try {
      await runService.importFromCircleCI(trimmed);
      setImportState('running');
      pollUntilDone();
    } catch (err) {
      setImportState('error');
      setImportError(err.response?.data?.error || 'Failed to start import.');
      playError();
    }
  }, [importState, pollUntilDone]);

  const openModal = useCallback(() => {
    if (importState !== 'running') {
      setImportState('idle');
      setImportOutput('');
      setImportError('');
      setImportQueue([]);
      queueRef.current = [];
    }
    setImportModalOpen(true);
  }, [importState]);

  const closeModal = useCallback(() => {
    setImportModalOpen(false);
  }, []);

  const resetImport = useCallback(() => {
    stopPolling();
    setImportState('idle');
    setImportOutput('');
    setImportError('');
    setImportQueue([]);
    queueRef.current = [];
    setImportModalOpen(false);
    setImportedRunId(null);
  }, [stopPolling]);

  const dismissToast = useCallback(() => {
    setImportState('idle');
    setImportOutput('');
    setImportError('');
  }, []);

  return (
    <ImportContext.Provider value={{
      importState,
      importOutput,
      importError,
      importQueue,
      importModalOpen,
      importedRunId,
      startImport,
      openModal,
      closeModal,
      resetImport,
      dismissToast,
    }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport must be used within ImportProvider');
  return ctx;
}

const TOAST_CONFIGS = {
  running: { bg: 'var(--sidebar-bg, #1a3a2a)', color: '#fff' },
  done: { bg: 'linear-gradient(135deg, #1a3a2a 0%, #2e7d4f 100%)', color: '#fff' },
  error: { bg: '#fce4ec', color: '#c62828', border: '1px solid #ef9a9a' },
  duplicate: { bg: '#fff8e1', color: '#e65100', border: '1px solid #ffe082' },
};

const AUTO_DISMISS_MS = 8000;

const CONFETTI_COLORS = ['#4CAF50', '#CDF545', '#FFD700', '#FF6B6B', '#45B7D1', '#fff', '#a5d6a7'];
const PARTICLE_COUNT = 40;

function spawnConfetti(canvasRef) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = 320;
  const H = canvas.height = 200;

  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 60,
    y: H - 20,
    vx: (Math.random() - 0.5) * 8,
    vy: -(Math.random() * 6 + 4),
    size: Math.random() * 5 + 3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 12,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    opacity: 1,
  }));

  let frame;
  const gravity = 0.12;
  const friction = 0.98;

  function animate() {
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    particles.forEach((p) => {
      p.vy += gravity;
      p.vx *= friction;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.opacity = Math.max(0, p.opacity - 0.012);
      if (p.opacity <= 0) return;
      alive = true;
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    if (alive) {
      frame = requestAnimationFrame(animate);
    }
  }
  animate();
  return () => { if (frame) cancelAnimationFrame(frame); };
}

export function ImportToast() {
  const { importState, importQueue, importError, importModalOpen, importedRunId, openModal, dismissToast } = useImport();
  const navigate = useNavigate();
  const dismissTimer = useRef(null);
  const confettiRef = useRef(null);
  const confettiCleanup = useRef(null);
  const showable = !importModalOpen && ['running', 'done', 'error', 'duplicate'].includes(importState);

  // Auto-dismiss for completion states
  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (!importModalOpen && (importState === 'done' || importState === 'error' || importState === 'duplicate')) {
      dismissTimer.current = setTimeout(dismissToast, AUTO_DISMISS_MS);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [importState, importModalOpen, dismissToast]);

  // Fire confetti on success
  useEffect(() => {
    if (!importModalOpen && importState === 'done') {
      // Small delay so the canvas is rendered
      const t = setTimeout(() => {
        confettiCleanup.current = spawnConfetti(confettiRef);
      }, 50);
      return () => {
        clearTimeout(t);
        confettiCleanup.current?.();
      };
    }
  }, [importState, importModalOpen]);

  if (!showable) return null;

  const config = TOAST_CONFIGS[importState];
  const isSuccess = importState === 'done';

  const handleClick = () => {
    if (importState === 'running') {
      navigate('/runs');
      openModal();
    } else if ((importState === 'done' || importState === 'duplicate') && importedRunId) {
      navigate(`/runs/${importedRunId}`);
      dismissToast();
    } else {
      navigate('/runs');
      dismissToast();
    }
  };

  const handleDismiss = (e) => {
    e.stopPropagation();
    dismissToast();
  };

  return (
    <div
      className={`import-toast ${isSuccess ? 'import-toast--success' : ''}`}
      onClick={handleClick}
      style={{
        background: config.bg,
        color: config.color,
        border: config.border || 'none',
      }}
    >
      <style>{`
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .import-toast .import-dots { display: inline-flex; gap: 4px; align-items: center; }
        .import-toast .import-dots span {
          width: 7px; height: 7px; border-radius: 50%;
          background: currentColor;
          animation: dotPulse 1.4s infinite ease-in-out both;
        }
        .import-toast .import-dots span:nth-child(2) { animation-delay: 0.16s; }
        .import-toast .import-dots span:nth-child(3) { animation-delay: 0.32s; }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes successPop {
          0% { opacity: 0; transform: translateY(12px) scale(0.8); }
          50% { transform: translateY(-4px) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shimmerSlide {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes checkDraw {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .import-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          border-radius: var(--radius-lg, 12px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          cursor: pointer;
          z-index: 200;
          animation: toastIn 0.25s ease;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          font-family: inherit;
        }
        .import-toast:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }
        .import-toast--success {
          padding: 14px 22px;
          gap: 12px;
          animation: successPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 0 6px 24px rgba(26, 58, 42, 0.35), 0 0 40px rgba(76, 175, 80, 0.15);
        }
        .import-toast--success:hover {
          box-shadow: 0 8px 28px rgba(26, 58, 42, 0.4), 0 0 50px rgba(76, 175, 80, 0.2);
        }
        .import-toast--success .import-toast-text {
          font-size: 14px;
          background: linear-gradient(90deg, #fff 0%, #CDF545 50%, #fff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmerSlide 2s ease-in-out 0.4s 1;
        }
        .import-toast--success .import-toast-check {
          stroke-dasharray: 24;
          stroke-dashoffset: 0;
          animation: checkDraw 0.4s ease 0.15s both;
        }
        .import-toast-confetti {
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          pointer-events: none;
        }
        .import-toast-text {
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }
        .import-toast-sub {
          font-size: 11px;
          font-weight: 500;
          opacity: 0.7;
        }
        .import-toast-dismiss {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border: none;
          background: none;
          color: inherit;
          opacity: 0.5;
          cursor: pointer;
          padding: 0;
          margin-left: 2px;
          border-radius: 50%;
          transition: opacity 0.15s;
        }
        .import-toast-dismiss:hover {
          opacity: 1;
        }
      `}</style>

      {importState === 'running' && (
        <>
          <span className="import-toast-text">Importing</span>
          <div className="import-dots"><span /><span /><span /></div>
          {importQueue.length > 0 && (
            <span className="import-toast-sub">+{importQueue.length} queued</span>
          )}
        </>
      )}

      {importState === 'done' && (
        <>
          <canvas ref={confettiRef} className="import-toast-confetti" width="320" height="200" />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#CDF545" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path className="import-toast-check" d="M20 6 9 17l-5-5" />
          </svg>
          <span className="import-toast-text">Import complete!</span>
          <button className="import-toast-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}

      {importState === 'error' && (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <span className="import-toast-text">Import failed</span>
          {importError && <span className="import-toast-sub" title={importError}>View details</span>}
          <button className="import-toast-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}

      {importState === 'duplicate' && (
        <>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="import-toast-text">Already imported</span>
          <button className="import-toast-dismiss" onClick={handleDismiss} aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
