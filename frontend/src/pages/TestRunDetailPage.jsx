import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import { useAuth } from '../context/AuthContext';
import stripTestRailId from '../utils/stripTestRailId';
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
  const [openUp, setOpenUp] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const handleOpen = () => {
    if (locked) return;
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 220);
    }
    setOpen(!open);
  };

  return (
    <div className={`status-dropdown ${locked ? 'status-dropdown--locked' : ''}`} ref={ref}>
      <button
        className="status-dropdown-trigger"
        style={{
          color: `var(--status-${status.toLowerCase()})`,
          backgroundColor: `var(--status-${status.toLowerCase()}-bg)`,
        }}
        onClick={handleOpen}
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
        <div className={`status-dropdown-menu ${openUp ? 'status-dropdown-menu--up' : ''}`}>
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
      map[key] = { name: key, describeTitle: r.describe_title || null, sourcePath: r.source_path || null, results: [] };
      groups.push(map[key]);
    }
    map[key].results.push(r);
  }
  return groups;
}

/* ── Group results by suite, then by section (for combined runs) ── */
function groupBySuiteThenSection(results) {
  const suiteGroups = [];
  const suiteMap = {};
  for (const r of results) {
    const suiteKey = r.suite_name || 'Unknown';
    if (!suiteMap[suiteKey]) {
      suiteMap[suiteKey] = { name: suiteKey, results: [] };
      suiteGroups.push(suiteMap[suiteKey]);
    }
    suiteMap[suiteKey].results.push(r);
  }
  // Within each suite, group by section
  return suiteGroups.map((sg) => ({
    ...sg,
    sections: groupBySection(sg.results),
  }));
}

/* ── Main page ── */
export default function TestRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const filter = searchParams.get('status') || 'All';
  const setFilter = (status) => {
    if (status === 'All') {
      searchParams.delete('status');
    } else {
      searchParams.set('status', status);
    }
    setSearchParams(searchParams, { replace: true });
  };
  const [updating, setUpdating] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [selected, setSelected] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`runSelection-${runId}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [copiedRowId, setCopiedRowId] = useState(null);
  const [showDeleteRun, setShowDeleteRun] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const nameInputRef = useRef(null);

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

  const updateSelected = (updater) => {
    setSelected((prev) => {
      const next = updater(prev);
      sessionStorage.setItem(`runSelection-${runId}`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleSelect = (id) => {
    updateSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids) => {
    updateSelected((prev) => {
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
      sessionStorage.removeItem(`runSelection-${runId}`);
    } catch {
      /* partial failure — user will see mixed states */
    } finally {
      setBulkUpdating(false);
    }
  };

  const stats = computeStats(results);
  const filtered = filter === 'All' ? results : results.filter((r) => r.status === filter);
  const isCombinedRun = run?.suite_name === 'All Suites' || !run?.suite_id;
  const sections = useMemo(() => groupBySection(filtered), [filtered]);
  const suiteGroups = useMemo(() => isCombinedRun ? groupBySuiteThenSection(filtered) : null, [filtered, isCombinedRun]);
  const [collapsedSuites, setCollapsedSuites] = useState({});
  const toggleSuite = (name) => setCollapsedSuites((prev) => ({ ...prev, [name]: !prev[name] }));

  const toggleSection = (name) => setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));

  const startRename = () => {
    setDraftName(run?.name?.split(' · ')[0] || run?.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 50);
  };

  const saveRename = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === (run?.name?.split(' · ')[0])) {
      setEditingName(false);
      return;
    }
    const datePart = run?.name?.includes(' · ') ? run.name.split(' · ').slice(1).join(' · ') : '';
    const newName = datePart ? `${trimmed} · ${datePart}` : trimmed;
    try {
      const updated = await runService.update(runId, { name: newName });
      setRun(updated);
      window.__refreshSidebarRuns?.();
    } catch { /* keep old name */ }
    setEditingName(false);
  };

  const copyRow = (r, e) => {
    e.stopPropagation();
    const title = stripTestRailId(r.case_title);
    const file = r.source_file || r.section_name || '';
    const text = `${file}\t${title}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedRowId(r.id);
      setTimeout(() => setCopiedRowId(null), 1500);
    });
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Guardian', path: '/' }]} /><LoadingSpinner /></>;

  const passRateColor = stats.pass_rate >= 80 ? 'var(--status-passed)' : stats.pass_rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Guardian', path: '/' },
        ...(run?.project_name ? [{ label: run.project_name, path: `/projects/${run.project_id}` }] : []),
        { label: run?.name || formatRunDate(run?.run_date || run?.created_at) },
      ]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            {editingName ? (
              <div className="run-rename-row">
                <input
                  ref={nameInputRef}
                  className="run-rename-input"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingName(false); }}
                  onBlur={saveRename}
                />
              </div>
            ) : (
              <h2 className="page-heading run-heading-editable" onClick={startRename} title="Click to rename">
                {run?.name?.split(' · ')[0] || run?.suite_name} &middot; {formatRunDate(run?.run_date || run?.created_at)}
                <svg className="run-edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </h2>
            )}
            <p className="page-description">{run?.name} &middot; {run?.is_locked ? 'Locked' : run?.is_completed ? 'Completed' : 'Active'}</p>
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-danger" onClick={() => setShowDeleteRun(true)}>Delete</button>
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
              <span className="stat-tile-pct">&nbsp;</span>
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
              <span className="stat-tile-pct">&nbsp;</span>
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

        {(isCombinedRun ? (suiteGroups && suiteGroups.length > 0) : sections.length > 0) ? (
          <div className="run-section-tree">
            {isCombinedRun ? (
              /* Two-level: Suite > Section > Results */
              suiteGroups.map((sg) => (
                <div key={sg.name} className="run-suite-group">
                  <div className="run-suite-header" onClick={() => toggleSuite(sg.name)}>
                    <svg className={`run-section-chevron ${collapsedSuites[sg.name] ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <span className="run-suite-name">{sg.name}</span>
                    <span className="run-section-count">{sg.results.length}</span>
                  </div>
                  {!collapsedSuites[sg.name] && (
                    <div className="run-suite-sections">
                      {sg.sections.map((sec) => (
                        <div key={`${sg.name}-${sec.name}`} className="run-section-group">
                          <div
                            className="run-section-header"
                            onClick={(e) => {
                              const tag = e.target.closest('.run-section-name, .run-section-file, .run-section-info');
                              if (!tag) toggleSection(`${sg.name}/${sec.name}`);
                            }}
                          >
                            <svg className={`run-section-chevron ${collapsed[`${sg.name}/${sec.name}`] ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            {sec.describeTitle ? (
                              <span className="run-section-info">
                                <span className="run-section-name">{sec.describeTitle}</span>
                                <span className="run-section-file" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sec.name); const el = e.currentTarget; el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1500); }}>{sec.name}</span>
                              </span>
                            ) : sec.sourcePath ? (
                              <span className="run-section-file" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sec.name); const el = e.currentTarget; el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1500); }}>{sec.name}</span>
                            ) : (
                              <span className="run-section-name">{sec.name}</span>
                            )}
                                    <span className="run-section-count">{sec.results.length}</span>
                          </div>
                          {!collapsed[`${sg.name}/${sec.name}`] && (
                            <div className="run-section-cases">
                              {!run?.is_locked && sec.results.length > 1 && (
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
                                    sessionStorage.setItem('runPageScroll', window.scrollY.toString());
                                    navigate(`/runs/${runId}/execute/${r.id}`);
                                  }}
                                >
                                  {!run?.is_locked && <label className="run-checkbox-zone" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="run-checkbox" /></label>}
                                  <span className="run-case-title">{stripTestRailId(r.case_title)}</span>
                                  <span className="run-case-tested-by">
                                    <span className={`tested-by-tag ${r.tested_by_name === 'Automation' ? 'automation' : 'user'}`}>{r.tested_by_name || 'Automation'}</span>
                                  </span>
                                  <span className="run-case-status" onClick={(e) => e.stopPropagation()}>
                                    <StatusDropdown status={r.status} onChangeStatus={(newStatus) => handleStatusChange(r.id, newStatus)} locked={r.is_locked} />
                                  </span>
                                  <button className={`run-case-copy ${copiedRowId === r.id ? 'run-case-copy--copied' : ''}`} onClick={(e) => copyRow(r, e)} title="Copy test ID, file, and title">
                                    {copiedRowId === r.id ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              /* Single-level: Section > Results (existing behavior) */
              sections.map((sec) => (
                <div key={sec.name} className="run-section-group">
                  <div
                    className="run-section-header"
                    onClick={(e) => {
                      const tag = e.target.closest('.run-section-name, .run-section-file, .run-section-info');
                      if (!tag) toggleSection(sec.name);
                    }}
                  >
                    <svg className={`run-section-chevron ${collapsed[sec.name] ? '' : 'open'}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    {sec.describeTitle ? (
                      <span className="run-section-info">
                        <span className="run-section-name">{sec.describeTitle}</span>
                        <span className="run-section-file" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sec.name); const el = e.currentTarget; el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1500); }}>{sec.name}</span>
                      </span>
                    ) : sec.sourcePath ? (
                      <span className="run-section-file" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(sec.name); const el = e.currentTarget; el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1500); }}>{sec.name}</span>
                    ) : (
                      <span className="run-section-name">{sec.name}</span>
                    )}
                    <span className="run-section-count">{sec.results.length}</span>
                  </div>
                  {!collapsed[sec.name] && (
                    <div className="run-section-cases">
                      {!run?.is_locked && sec.results.length > 1 && (
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
                            sessionStorage.setItem('runPageScroll', window.scrollY.toString());
                            navigate(`/runs/${runId}/execute/${r.id}`);
                          }}
                        >
                          {!run?.is_locked && (
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} onClick={(e) => e.stopPropagation()} className="run-checkbox" />
                          )}
                          <span className="run-case-title">{stripTestRailId(r.case_title)}</span>
                          <span className="run-case-tested-by">
                            <span className={`tested-by-tag ${r.tested_by_name === 'Automation' ? 'automation' : 'user'}`}>{r.tested_by_name || 'Automation'}</span>
                          </span>
                          <span className="run-case-status" onClick={(e) => e.stopPropagation()}>
                            <StatusDropdown status={r.status} onChangeStatus={(newStatus) => handleStatusChange(r.id, newStatus)} locked={r.is_locked} />
                          </span>
                          <button className={`run-case-copy ${copiedRowId === r.id ? 'run-case-copy--copied' : ''}`} onClick={(e) => copyRow(r, e)} title="Copy test ID, file, and title">
                            {copiedRowId === r.id ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
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
          <button className="btn btn-secondary btn-sm bulk-status-clear" onClick={() => { setSelected(new Set()); sessionStorage.removeItem(`runSelection-${runId}`); }}>Clear</button>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteRun}
        onClose={() => setShowDeleteRun(false)}
        onConfirm={async () => {
          await runService.delete(runId);
          window.__refreshSidebarProjects?.();
          window.__refreshSidebarRuns?.();
          navigate(`/projects/${run.project_id}`);
        }}
        title="Delete Test Run"
        message={`"${run?.name}" (${results.length} result${results.length !== 1 ? 's' : ''}) will be permanently deleted.`}
        requireSafeguard
      />
    </div>
  );
}
