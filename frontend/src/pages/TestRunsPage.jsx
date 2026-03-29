import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SuiteDropdown from '../components/SuiteDropdown';
import DateRangePicker from '../components/DateRangePicker';
import runService from '../services/runService';
import { useImport } from '../context/ImportContext';
import './DashboardPage.css';

const STATUS_ORDER = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];
const PAGE_SIZE = 100;

/** A run is "done" for display grouping when it's date-locked (older than today).
 *  is_completed is NOT used here — all CircleCI imports are is_completed=true
 *  but today's runs should still appear in Open Runs. */
const isRunDone = (r) => r.is_locked;

function PassRate({ rate, compact }) {
  const color = rate >= 80 ? 'var(--status-passed)' : rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';
  return (
    <div className="run-card-v2-rate">
      <span className="run-card-v2-rate-number" style={{ color }}>{rate}%</span>
      {!compact && <span className="run-card-v2-rate-label">pass rate</span>}
    </div>
  );
}

function shortenUrl(url) {
  if (!url) return '';
  const match = url.match(/workflows\/([a-f0-9-]+)/i);
  if (match) return `Workflow ${match[1].slice(0, 8)}\u2026`;
  return url.length > 45 ? '\u2026' + url.slice(-40) : url;
}

function RunCard({ run, selected, onToggleSelect }) {
  const total = run.stats?.total || 0;
  const passRate = run.stats?.pass_rate || 0;

  // Simplified view for date-locked runs (not editable)
  if (run.is_locked) {
    return (
      <div className={`run-card-v2 run-card-v2--compact${selected ? ' run-card-v2--selected' : ''}`}>
        <div className="run-card-v2-select" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            aria-label={`Select run ${run.name}`}
            checked={selected}
            onChange={() => onToggleSelect(run.id)}
          />
        </div>
        <Link to={`/runs/${run.id}`} className="run-card-v2-body" style={{ textDecoration: 'none' }}>
          <span className="run-card-v2-name">{run.name?.split(' · ')[0] || run.suite_name}</span>
          <span className="run-card-v2-date">
            {run.completed_at && new Date(run.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </Link>
        <PassRate rate={passRate} compact />
      </div>
    );
  }

  // Full view for open runs
  return (
    <div className={`run-card-v2${selected ? ' run-card-v2--selected' : ''}`}>
      <div className="run-card-v2-select" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Select run ${run.name}`}
          checked={selected}
          onChange={() => onToggleSelect(run.id)}
        />
      </div>
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

  // Filter state
  const [runStatusFilter, setRunStatusFilter] = useState('All');
  const [runSuiteFilter, setRunSuiteFilter] = useState('');
  const [runDateStart, setRunDateStart] = useState(null);
  const [runDateEnd, setRunDateEnd] = useState(null);
  const [runSearchQuery, setRunSearchQuery] = useState('');
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [showBulkDeleteRuns, setShowBulkDeleteRuns] = useState(false);

  const {
    importState, importOutput, importError, importQueue,
    importModalOpen, activeUrl, startImport, openModal, closeModal,
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

  // ── Filtering (client-side) ──
  const filteredRuns = useMemo(() => {
    let result = runs;
    if (runStatusFilter === 'Active') result = result.filter(r => !isRunDone(r));
    else if (runStatusFilter === 'Completed') result = result.filter(r => isRunDone(r));
    if (runSuiteFilter) {
      result = result.filter(r => (r.suite_name || '') === runSuiteFilter);
    }
    if (runDateStart) {
      result = result.filter(r => new Date(r.created_at) >= runDateStart);
    }
    if (runDateEnd) {
      const endOfDay = new Date(runDateEnd);
      endOfDay.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.created_at) <= endOfDay);
    }
    if (runSearchQuery.trim()) {
      const q = runSearchQuery.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.suite_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [runs, runStatusFilter, runSuiteFilter, runDateStart, runDateEnd, runSearchQuery]);

  const runFilterStats = useMemo(() => ({
    All: runs.length,
    Active: runs.filter(r => !isRunDone(r)).length,
    Completed: runs.filter(r => isRunDone(r)).length,
  }), [runs]);

  const runSuiteNames = useMemo(() => {
    const names = new Set(runs.map(r => r.suite_name).filter(n => n && n !== 'All Suites'));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [runs]);

  const runHasActiveFilters = runStatusFilter !== 'All' || runSearchQuery || runSuiteFilter || runDateStart || runDateEnd;

  const clearAllFilters = () => {
    setRunStatusFilter('All');
    setRunSearchQuery('');
    setRunSuiteFilter('');
    setRunDateStart(null);
    setRunDateEnd(null);
    setSelectedRuns(new Set());
  };

  // ── Selection ──
  const toggleRunSelect = (id) => {
    setSelectedRuns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDeleteRuns = async () => {
    try {
      await runService.bulkDelete([...selectedRuns]);
      setSelectedRuns(new Set());
      setShowBulkDeleteRuns(false);
      fetchRuns();
    } catch { /* silent */ }
  };

  // ── Import ──
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

  // ── Pagination ──
  const hasMore = runs.length < totalCount;
  const handleLoadMore = () => {
    fetchRuns(runs.length, true);
  };

  // ── Derive card layout sections from filtered runs ──
  const getEffectiveDate = (r) => {
    if (r.run_date) return new Date(r.run_date + 'T12:00:00').getTime();
    return r.created_at ? new Date(r.created_at).getTime() : 0;
  };
  const sortNewest = (a, b) => getEffectiveDate(b) - getEffectiveDate(a);
  const openRuns = filteredRuns.filter(r => !isRunDone(r)).sort(sortNewest);
  const completedRuns = filteredRuns.filter(r => isRunDone(r)).sort(sortNewest);

  // Group completed runs by run date.
  // run_date is a plain "YYYY-MM-DD" string (local calendar date). Parse with
  // T12:00 to avoid UTC-midnight timezone shift that would move the date back a day.
  const parseRunDate = (r) => {
    if (r.run_date) return new Date(r.run_date + 'T12:00:00');
    return r.created_at ? new Date(r.created_at) : null;
  };
  const completedByDateMap = completedRuns.reduce((groups, run) => {
    const d = parseRunDate(run);
    const dateKey = d
      ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : 'Unknown Date';
    const ts = d ? d.getTime() : 0;
    if (!groups[dateKey]) groups[dateKey] = { ts, runs: [] };
    groups[dateKey].runs.push(run);
    return groups;
  }, {});
  const completedByDate = Object.entries(completedByDateMap)
    .sort(([, a], [, b]) => b.ts - a.ts)
    .reduce((acc, [key, val]) => { acc[key] = val.runs; return acc; }, {});

  if (loading) return <><Header breadcrumbs={[{ label: 'Test Runs' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <Header breadcrumbs={[{ label: 'Test Runs' }]} />
      <div className="page-content">
        {/* Page toolbar */}
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">Test Runs</h2>
            <span className="text-muted" style={{ fontSize: 14 }}>
              {runHasActiveFilters
                ? `Showing ${filteredRuns.length} of ${runs.length} loaded runs`
                : `${runs.length} of ${totalCount} run${totalCount !== 1 ? 's' : ''}`
              }
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

        {/* Filter toolbar */}
        <div className="runs-filter-toolbar">
          <div className="runs-filter-pills">
            {['All', 'Active', 'Completed'].map(f => (
              <button
                key={f}
                className={`runs-filter-pill${runStatusFilter === f ? ' runs-filter-pill--active' : ''}`}
                onClick={() => { setRunStatusFilter(f); setSelectedRuns(new Set()); }}
              >
                {f} <span className="runs-filter-pill-count">{runFilterStats[f]}</span>
              </button>
            ))}
          </div>
          <SuiteDropdown
            value={runSuiteFilter}
            options={runSuiteNames}
            onChange={val => { setRunSuiteFilter(val); setSelectedRuns(new Set()); }}
          />
          <DateRangePicker
            startDate={runDateStart}
            endDate={runDateEnd}
            onChange={(s, e) => { setRunDateStart(s); setRunDateEnd(e); setSelectedRuns(new Set()); }}
          />
          <div className="runs-search-wrapper">
            <svg className="runs-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="runs-search-input"
              type="text"
              placeholder="Search runs..."
              aria-label="Search runs"
              value={runSearchQuery}
              onChange={e => { setRunSearchQuery(e.target.value); setSelectedRuns(new Set()); }}
            />
            {runSearchQuery && (
              <button className="runs-search-clear" aria-label="Clear search" onClick={() => { setRunSearchQuery(''); setSelectedRuns(new Set()); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Active filter indicator */}
        {runHasActiveFilters && (
          <div className="runs-active-filter">
            Showing {filteredRuns.length} of {runs.length} runs
            <button className="runs-clear-filters" onClick={clearAllFilters}>
              Clear filters
            </button>
          </div>
        )}

        {/* Card layout */}
        {filteredRuns.length > 0 ? (
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
                    <RunCard key={run.id} run={run} selected={selectedRuns.has(run.id)} onToggleSelect={toggleRunSelect} />
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
                        <RunCard key={run.id} run={run} selected={selectedRuns.has(run.id)} onToggleSelect={toggleRunSelect} />
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
          <p className="empty-message">{runs.length > 0 ? 'No runs match the current filters.' : 'No test runs yet. Import from CircleCI to get started.'}</p>
        )}

        {/* Floating bulk action bar */}
        {selectedRuns.size > 0 && (
          <div className="bulk-action-bar">
            <span className="bulk-action-count">{selectedRuns.size} run{selectedRuns.size !== 1 ? 's' : ''} selected</span>
            <button className="btn btn-danger btn-sm" onClick={() => setShowBulkDeleteRuns(true)}>DELETE</button>
          </div>
        )}

        <ConfirmDialog
          isOpen={showBulkDeleteRuns}
          onClose={() => setShowBulkDeleteRuns(false)}
          onConfirm={handleBulkDeleteRuns}
          title="Delete Test Runs"
          message={`${selectedRuns.size} test run${selectedRuns.size !== 1 ? 's' : ''} will be permanently deleted. This cannot be undone.`}
          requireSafeguard
        />
      </div>

      {/* Import modal */}
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
              <p className="import-modal-hint">Paste a CircleCI workflow URL to import test results.</p>
              <div className="import-modal-input-row">
                <input
                  type="text"
                  className="import-modal-input"
                  placeholder="https://app.circleci.com/pipelines/..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleImportSubmit()}
                  autoFocus
                />
                <button className="import-modal-submit" onClick={handleImportSubmit} disabled={!importUrl.trim()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
              <div className="import-queue-list">
                {activeUrl && (
                  <div className="import-queue-item import-queue-item--active">
                    <div className="import-queue-item-header">
                      <span className="import-queue-item-url">{shortenUrl(activeUrl)}</span>
                      <span className="import-queue-item-status">{'Importing\u2026'}</span>
                    </div>
                    <div className="import-queue-bar">
                      <div className="import-queue-bar-fill import-queue-bar-fill--active" />
                    </div>
                  </div>
                )}
                {importQueue.map((url, i) => (
                  <div key={i} className="import-queue-item">
                    <div className="import-queue-item-header">
                      <span className="import-queue-item-url">{shortenUrl(url)}</span>
                      <span className="import-queue-item-status import-queue-item-status--queued">Queued</span>
                    </div>
                    <div className="import-queue-bar" />
                  </div>
                ))}
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
