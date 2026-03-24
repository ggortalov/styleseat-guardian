import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import runService from '../services/runService';
import './DashboardPage.css';

const STATUS_ORDER = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];
const PAGE_SIZE = 30;

function PassRate({ rate, compact }) {
  const color = rate >= 80 ? 'var(--status-passed)' : rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';
  return (
    <div className="run-card-v2-rate">
      <span className="run-card-v2-rate-number" style={{ color }}>{rate}%</span>
      {!compact && <span className="run-card-v2-rate-label">pass rate</span>}
    </div>
  );
}

function RunCard({ run }) {
  const total = run.stats?.total || 0;
  const passRate = run.stats?.pass_rate || 0;

  // Simplified view for completed/locked runs
  if (run.is_locked) {
    return (
      <Link to={`/runs/${run.id}`} className="run-card-v2 run-card-v2--compact">
        <div className="run-card-v2-body">
          <span className="run-card-v2-name">{run.name?.split(' · ')[0] || run.suite_name}</span>
          <span className="run-card-v2-date">
            {run.completed_at && new Date(run.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <PassRate rate={passRate} compact />
      </Link>
    );
  }

  // Full view for open runs
  return (
    <div className="run-card-v2">
      <div className="run-card-v2-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 14l2 2 4-4" />
        </svg>
      </div>

      <div className="run-card-v2-body">
        <div className="run-card-v2-header">
          <Link to={`/runs/${run.id}`} className="run-card-v2-name">{run.name?.split(' · ')[0] || run.suite_name}</Link>
        </div>
        <div className="run-card-v2-meta">
          {total} test{total !== 1 ? 's' : ''} &middot; {new Date(run.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>

        {total > 0 && (
          <>
            <div className="run-card-v2-badges">
              {STATUS_ORDER.map((s) =>
                run.stats[s] > 0 ? (
                  <span
                    key={s}
                    className="run-card-v2-badge"
                    style={{
                      color: `var(--status-${s.toLowerCase()})`,
                      backgroundColor: `var(--status-${s.toLowerCase()}-bg)`,
                    }}
                  >
                    {s}: {run.stats[s]}
                  </span>
                ) : null
              )}
            </div>

            <div className="run-card-v2-bar">
              {STATUS_ORDER.map((s) =>
                run.stats[s] > 0 ? (
                  <div
                    key={s}
                    className="bar-segment"
                    style={{
                      width: `${(run.stats[s] / total) * 100}%`,
                      backgroundColor: `var(--status-${s.toLowerCase()})`,
                    }}
                    title={`${s}: ${run.stats[s]}`}
                  />
                ) : null
              )}
            </div>
          </>
        )}
      </div>

      <PassRate rate={passRate} />

      <Link to={`/runs/${run.id}`} className="run-card-v2-chevron" title="Open run">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </div>
  );
}

export default function TestRunsPage() {
  const [runs, setRuns] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importState, setImportState] = useState('idle'); // idle | submitting | running | done | error
  const [importOutput, setImportOutput] = useState('');
  const [importError, setImportError] = useState('');
  const pollRef = useRef(null);

  const fetchRuns = useCallback((offset = 0, append = false) => {
    const setLoadState = append ? setLoadingMore : setLoading;
    setLoadState(true);
    runService.getAll({ limit: PAGE_SIZE, offset })
      .then((data) => {
        const items = data.items || [];
        setRuns((prev) => append ? [...prev, ...items] : items);
        setTotalCount(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoadState(false));
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await runService.getImportStatus();
        setImportOutput(status.output || '');
        if (!status.running) {
          stopPolling();
          if (status.success) {
            setImportState('done');
            fetchRuns(); // refresh the run list
            window.__refreshSidebarRuns?.();
          } else if (status.exit_code === 2) {
            // Exit code 2 = duplicate workflow
            setImportState('duplicate');
          } else {
            setImportState('error');
            setImportError(status.output || 'Import failed. Check server logs.');
          }
        }
      } catch {
        stopPolling();
        setImportState('error');
        setImportError('Lost connection while checking import status.');
      }
    }, 2000);
  }, [stopPolling, fetchRuns]);

  const handleImportSubmit = async () => {
    if (!importUrl.trim()) return;
    setImportState('submitting');
    setImportError('');
    setImportOutput('');
    try {
      await runService.importFromCircleCI(importUrl.trim());
      setImportState('running');
      startPolling();
    } catch (err) {
      setImportState('error');
      setImportError(err.response?.data?.error || 'Failed to start import.');
    }
  };

  const handleImportClose = () => {
    if (importState === 'running') return; // don't close while running
    stopPolling();
    setImportModalOpen(false);
    setImportUrl('');
    setImportState('idle');
    setImportOutput('');
    setImportError('');
  };

  const hasMore = runs.length < totalCount;

  const handleLoadMore = () => {
    fetchRuns(runs.length, true);
  };

  const openRuns = runs.filter(r => !r.is_locked);
  const completedRuns = runs.filter(r => r.is_locked);

  // Group completed runs by run date
  const completedByDate = completedRuns.reduce((groups, run) => {
    const runDate = run.run_date || run.created_at;
    const date = runDate
      ? new Date(runDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown Date';
    if (!groups[date]) groups[date] = [];
    groups[date].push(run);
    return groups;
  }, {});

  if (loading) return <><Header breadcrumbs={[{ label: 'Test Runs' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <Header breadcrumbs={[{ label: 'Test Runs' }]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">Test Runs</h2>
            <span className="text-muted" style={{ fontSize: 14 }}>
              Showing {runs.length} of {totalCount} run{totalCount !== 1 ? 's' : ''}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => setImportModalOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Import from CircleCI
          </button>
        </div>

        {runs.length > 0 ? (
          <>
            {openRuns.length > 0 && (
              <div className="run-section">
                <h3 className="run-section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                  Open Runs
                  <span className="run-section-count">{openRuns.length}</span>
                </h3>
                <div className="run-list-v2">
                  {openRuns.map((run) => (
                    <RunCard key={run.id} run={run} />
                  ))}
                </div>
              </div>
            )}

            {completedRuns.length > 0 && (
              <div className="run-section">
                <h3 className="run-section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Completed
                  <span className="run-section-count">{completedRuns.length}</span>
                </h3>
                {Object.entries(completedByDate).map(([date, dateRuns]) => (
                  <div key={date} className="run-date-group">
                    <div className="run-date-header">{date}</div>
                    <div className="run-list-v2">
                      {dateRuns.map((run) => (
                        <RunCard key={run.id} run={run} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasMore && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : `Load More (${totalCount - runs.length} remaining)`}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="empty-message">No test runs yet. Create a test run from a project's suite page.</p>
        )}
      </div>

      <Modal isOpen={importModalOpen} onClose={handleImportClose} title="Import from CircleCI">
        {importState === 'idle' || importState === 'submitting' || importState === 'error' ? (
          <>
            <p style={{ margin: '0 0 12px', color: '#666', fontSize: 14 }}>
              Paste a CircleCI workflow URL, path, or UUID to import test results.
            </p>
            <input
              type="text"
              className="form-control"
              placeholder="Paste CircleCI workflow URL or ID"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importState !== 'submitting' && handleImportSubmit()}
              disabled={importState === 'submitting'}
              style={{ width: '100%', marginBottom: 12 }}
              autoFocus
            />
            {importError && (
              <p style={{ color: 'var(--status-failed)', fontSize: 13, margin: '0 0 12px' }}>{importError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={handleImportClose} disabled={importState === 'submitting'}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleImportSubmit} disabled={importState === 'submitting' || !importUrl.trim()}>
                {importState === 'submitting' ? 'Starting...' : 'Import'}
              </button>
            </div>
          </>
        ) : importState === 'running' ? (
          <>
            <style>{`
              @keyframes dotPulse {
                0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1); }
              }
              .import-dots { display: inline-flex; gap: 4px; align-items: center; }
              .import-dots span {
                width: 7px; height: 7px; border-radius: 50%;
                background: var(--sidebar-bg, #1a3a2a);
                animation: dotPulse 1.4s infinite ease-in-out both;
              }
              .import-dots span:nth-child(2) { animation-delay: 0.16s; }
              .import-dots span:nth-child(3) { animation-delay: 0.32s; }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="import-dots"><span /><span /><span /></div>
              <span style={{ fontSize: 14, color: '#333' }}>Importing from CircleCI</span>
            </div>
            {importOutput && (
              <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {importOutput}
              </pre>
            )}
          </>
        ) : importState === 'done' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--status-passed)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>Import completed successfully.</span>
            </div>
            {importOutput && (
              <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {importOutput}
              </pre>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleImportClose}>Close</button>
            </div>
          </>
        ) : importState === 'duplicate' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--status-blocked)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>This workflow has already been imported.</span>
            </div>
            {importOutput && (
              <pre style={{ background: '#fff8e1', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #ffe082' }}>
                {importOutput}
              </pre>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-primary" onClick={handleImportClose}>Close</button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}