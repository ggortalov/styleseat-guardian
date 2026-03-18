import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import { useAuth } from '../context/AuthContext';
import './TestRunDetailPage.css';

const STATUSES = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];
const STATUS_ICONS = {
  Passed:   '\u2714',
  Failed:   '\u2716',
  Blocked:  '\u26D4',
  Retest:   '\u21BB',
  Untested: '\u2013',
};

function computeStats(results) {
  const counts = { Passed: 0, Failed: 0, Blocked: 0, Retest: 0, Untested: 0 };
  results.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const total = results.length;
  const passRate = total > 0 ? Math.round((counts.Passed / total) * 1000) / 10 : 0;
  return { ...counts, total, pass_rate: passRate };
}

/* ── Inline status dropdown ── */
function StatusDropdown({ status, onChangeStatus, locked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className={`status-dropdown ${locked ? 'status-dropdown--locked' : ''}`} ref={ref}>
      <button
        className="status-dropdown-trigger"
        style={{
          color: `var(--status-${status.toLowerCase()})`,
          backgroundColor: `var(--status-${status.toLowerCase()}-bg)`,
        }}
        onClick={() => !locked && setOpen(!open)}
        disabled={locked}
        title={locked ? 'Locked - edits not allowed after 24 hours' : undefined}
      >
        <span className="status-dropdown-icon">{STATUS_ICONS[status]}</span>
        {status}
        {locked ? (
          <svg className="status-dropdown-lock" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        ) : (
          <svg className="status-dropdown-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        )}
      </button>
      {open && !locked && (
        <div className="status-dropdown-menu">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={`status-dropdown-option ${s === status ? 'selected' : ''}`}
              onClick={() => { onChangeStatus(s); setOpen(false); }}
            >
              <span className="status-dot" style={{ backgroundColor: `var(--status-${s.toLowerCase()})` }} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRunDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Group results by section ── */
function groupBySection(results) {
  const groups = [];
  const map = {};
  for (const r of results) {
    const key = r.section_name || 'Uncategorized';
    if (!map[key]) {
      map[key] = { name: key, results: [] };
      groups.push(map[key]);
    }
    map[key].results.push(r);
  }
  return groups;
}

/* ── Main page ── */
export default function TestRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [updating, setUpdating] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [r, res] = await Promise.all([
        runService.getById(runId),
        runService.getResults(runId),
      ]);
      setRun(r);
      setResults(res);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [runId, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Restore scroll position and highlight after content loads
  useLayoutEffect(() => {
    if (!loading) {
      const savedScroll = sessionStorage.getItem('runPageScroll');
      const highlightId = sessionStorage.getItem('highlightResult');

      if (highlightId && savedScroll) {
        // Restore scroll synchronously before paint
        window.scrollTo(0, parseInt(savedScroll, 10));

        // Clean up and highlight
        sessionStorage.removeItem('highlightResult');
        sessionStorage.removeItem('runPageScroll');

        requestAnimationFrame(() => {
          const element = document.getElementById(`result-${highlightId}`);
          if (element) {
            element.classList.add('run-case-row--highlight');
            setTimeout(() => element.classList.remove('run-case-row--highlight'), 2000);
          }
        });
      }
    }
  }, [loading]);

  const handleStatusChange = async (resultId, newStatus) => {
    setUpdating((prev) => ({ ...prev, [resultId]: true }));
    try {
      await runService.updateResult(resultId, { status: newStatus });
      setResults((prev) =>
        prev.map((r) => (r.id === resultId ? { ...r, status: newStatus, tested_by_name: user?.username || 'Unknown' } : r))
      );
    } catch {
      /* silently fail — user sees status didn't change */
    } finally {
      setUpdating((prev) => ({ ...prev, [resultId]: false }));
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) setSelected(new Set());
      return !prev;
    });
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => prev.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const handleBulkStatus = async (newStatus) => {
    setBulkUpdating(true);
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => runService.updateResult(id, { status: newStatus })));
      setResults((prev) =>
        prev.map((r) => ids.includes(r.id) ? { ...r, status: newStatus, tested_by_name: user?.username || 'Unknown' } : r)
      );
      setSelected(new Set());
    } catch {
      /* partial failure — user will see mixed states */
    } finally {
      setBulkUpdating(false);
    }
  };

  const stats = computeStats(results);
  const filtered = filter === 'All' ? results : results.filter((r) => r.status === filter);
  const sections = useMemo(() => groupBySection(filtered), [filtered]);

  const toggleSection = (name) => setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const passRateColor = stats.pass_rate >= 80 ? 'var(--status-passed)' : stats.pass_rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Dashboard', path: '/' },
        ...(run?.project_name ? [{ label: run.project_name, path: `/projects/${run.project_id}` }] : []),
        { label: formatRunDate(run?.created_at) || run?.name },
      ]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">{run?.suite_name} &middot; {formatRunDate(run?.created_at)}</h2>
            <p className="page-description">{run?.name} &middot; {run?.is_completed ? 'Completed' : 'Active'}</p>
          </div>
          <div className="toolbar-actions">
            <button className={`btn ${selectionMode ? 'btn-manage-active' : 'btn-secondary'}`} onClick={toggleSelectionMode}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              Manage
            </button>
            <button className="btn btn-secondary" onClick={() => navigate(`/projects/${run.project_id}`)}>Back to Project</button>
          </div>
        </div>

        {/* ── Stat tiles ── */}
        <div className="run-stats-section">
          <div className="stats-tiles">
            <button
              className={`stat-tile stat-tile-all ${filter === 'All' ? 'active' : ''}`}
              onClick={() => setFilter('All')}
            >
              <span className="stat-tile-count">{stats.total}</span>
              <span className="stat-tile-label">Total</span>
            </button>
            {STATUSES.map((s) => {
              const pct = stats.total > 0 ? Math.round((stats[s] / stats.total) * 100) : 0;
              return (
                <button
                  key={s}
                  className={`stat-tile ${filter === s ? 'active' : ''}`}
                  style={{ '--tile-color': `var(--status-${s.toLowerCase()})`, '--tile-bg': `var(--status-${s.toLowerCase()}-bg)` }}
                  onClick={() => setFilter(filter === s ? 'All' : s)}
                >
                  <span className="stat-tile-count">{stats[s]}</span>
                  <span className="stat-tile-label">{s}</span>
                  <span className="stat-tile-pct">{pct}%</span>
                </button>
              );
            })}
            <div className="stat-tile stat-tile-rate">
              <span className="stat-tile-count" style={{ color: passRateColor }}>{stats.pass_rate}%</span>
              <span className="stat-tile-label">Pass Rate</span>
            </div>
          </div>
        </div>

        {/* ── Results grouped by section ── */}
        <div className="results-header">
          <h3 className="panel-title">
            Test Results
            {filter !== 'All' && (
              <button className="filter-clear" onClick={() => setFilter('All')}>
                Showing {filter} &middot; Clear filter
              </button>
            )}
          </h3>
        </div>

        {sections.length > 0 ? (
          <div className="run-section-tree">
            {sections.map((sec) => (
              <div key={sec.name} className="run-section-group">
                <div className="run-section-header" onClick={() => toggleSection(sec.name)}>
                  <svg className={`run-section-chevron ${collapsed[sec.name] ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="run-section-name">{sec.name}</span>
                  <span className="run-section-count">{sec.results.length}</span>
                </div>
                {!collapsed[sec.name] && (
                  <div className="run-section-cases">
                    {selectionMode && sec.results.length > 0 && (
                      <div className="run-select-all" onClick={() => toggleSelectAll(sec.results.map((r) => r.id))}>
                        <input type="checkbox" checked={sec.results.every((r) => selected.has(r.id))} readOnly className="run-checkbox" />
                        <span className="run-select-all-label">Select All</span>
                      </div>
                    )}
                    {sec.results.map((r) => (
                      <div
                        key={r.id}
                        id={`result-${r.id}`}
                        className={`run-case-row ${updating[r.id] ? 'row-updating' : ''} ${selected.has(r.id) ? 'run-case-row--selected' : ''}`}
                        onClick={() => {
                          if (!selectionMode) {
                            sessionStorage.setItem('runPageScroll', window.scrollY.toString());
                            navigate(`/runs/${runId}/execute/${r.id}`);
                          }
                        }}
                      >
                        {selectionMode && (
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} onClick={(e) => e.stopPropagation()} className="run-checkbox" />
                        )}
                        <span className="run-case-id">C{String(r.case_id).padStart(7, '0')}</span>
                        <span className="run-case-title">{r.case_title}</span>
                        <span className="run-case-tested-by">
                          <span className={`tested-by-tag ${r.tested_by_name === 'Automation' ? 'automation' : 'user'}`}>
                            {r.tested_by_name || 'Automation'}
                          </span>
                        </span>
                        <span className="run-case-status" onClick={(e) => e.stopPropagation()}>
                          <StatusDropdown
                            status={r.status}
                            onChangeStatus={(newStatus) => handleStatusChange(r.id, newStatus)}
                            locked={r.is_locked}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="run-results-panel">
            <p className="empty-row" style={{ textAlign: 'center', padding: '32px 14px', color: 'var(--text-muted)' }}>No results match this filter.</p>
          </div>
        )}
      </div>

      {selected.size > 0 && (
        <div className={`bulk-status-bar ${bulkUpdating ? 'bulk-status-bar--updating' : ''}`}>
          <span className="bulk-status-count">{selected.size} selected</span>
          <span className="bulk-status-label">Set status:</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              className="bulk-status-btn"
              style={{ color: `var(--status-${s.toLowerCase()})`, backgroundColor: `var(--status-${s.toLowerCase()}-bg)` }}
              onClick={() => handleBulkStatus(s)}
              disabled={bulkUpdating}
            >
              <span className="status-dropdown-icon">{STATUS_ICONS[s]}</span>
              {s}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm bulk-status-clear" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </div>
  );
}
