import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import runService from '../services/runService';
import { useImport } from '../context/ImportContext';
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
  const [importUrl, setImportUrl] = useState('');

  const {
    importState, importOutput, importError, importQueue,
    importModalOpen, startImport, openModal, closeModal,
  } = useImport();

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

  // Refresh runs list when an import completes
  useEffect(() => {
    window.__onImportComplete = () => fetchRuns();
    return () => { delete window.__onImportComplete; };
  }, [fetchRuns]);

  const handleImportSubmit = async () => {
    if (!importUrl.trim()) return;
    const url = importUrl.trim();
    setImportUrl('');
    await startImport(url);
  };

  const handleImportClose = () => {
    closeModal();
    setImportUrl('');
  };

  const handleImportOpen = () => {
    openModal();
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
          <button className="btn btn-primary" onClick={handleImportOpen}>
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
        <div className="import-modal">
          {importState === 'idle' || importState === 'submitting' || importState === 'error' ? (
            <>
              <p className="import-modal-hint">Paste a CircleCI workflow URL to import test results.</p>
              <div className="import-modal-input-row">
                <input
                  type="text"
                  className="import-modal-input"
                  placeholder="https://app.circleci.com/pipelines/..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && importState !== 'submitting' && handleImportSubmit()}
                  disabled={importState === 'submitting'}
                  autoFocus
                />
                <button className="import-modal-submit" onClick={handleImportSubmit} disabled={importState === 'submitting' || !importUrl.trim()}>
                  {importState === 'submitting' ? (
                    <span className="import-modal-spinner" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  )}
                </button>
              </div>
              {importError && (
                <div className="import-modal-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {importError}
                </div>
              )}
            </>
          ) : importState === 'running' ? (
            <>
              <div className="import-modal-status">
                <div className="import-modal-status-icon import-modal-status-icon--running">
                  <span className="import-modal-ring" />
                </div>
                <div className="import-modal-status-body">
                  <span className="import-modal-status-title">Importing...</span>
                  {importQueue.length > 0 && (
                    <span className="import-modal-status-sub">+{importQueue.length} queued</span>
                  )}
                </div>
              </div>
              {importOutput && (
                <pre className="import-modal-output">{importOutput}</pre>
              )}
              <div className="import-modal-queue">
                <input
                  type="text"
                  className="import-modal-input"
                  placeholder="Queue another workflow URL..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImportSubmit()}
                />
                <button className="import-modal-submit" onClick={handleImportSubmit} disabled={!importUrl.trim()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
            </>
          ) : importState === 'done' ? (
            <>
              <div className="import-modal-status">
                <div className="import-modal-status-icon import-modal-status-icon--done">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <span className="import-modal-status-title">Import complete</span>
              </div>
              {importOutput && (
                <pre className="import-modal-output">{importOutput}</pre>
              )}
              <div className="import-modal-actions">
                <button className="btn btn-primary" onClick={handleImportClose}>Done</button>
              </div>
            </>
          ) : importState === 'duplicate' ? (
            <>
              <div className="import-modal-status">
                <div className="import-modal-status-icon import-modal-status-icon--duplicate">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <span className="import-modal-status-title">Already imported</span>
              </div>
              {importOutput && (
                <pre className="import-modal-output import-modal-output--warn">{importOutput}</pre>
              )}
              <div className="import-modal-actions">
                <button className="btn btn-primary" onClick={handleImportClose}>Done</button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
