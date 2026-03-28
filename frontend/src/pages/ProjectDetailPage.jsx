import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import projectService from '../services/projectService';
import suiteService from '../services/suiteService';
import runService from '../services/runService';
import dashboardService from '../services/dashboardService';
import { STATUS_ORDER } from '../constants/statusColors';
import './ProjectDetailPage.css';

function SyncLogCard({ log }) {
  const [expanded, setExpanded] = useState(false);
  const isSync = log.sync_type === 'cypress_sync';
  const date = new Date(log.created_at);
  const timeAgo = formatTimeAgo(date);

  return (
    <div className={`sync-log-card ${log.status === 'error' ? 'sync-log-card--error' : ''}`}>
      <div
        className="sync-log-header"
        onClick={() => log.new_case_names?.length > 0 && setExpanded(!expanded)}
        role={log.new_case_names?.length > 0 ? 'button' : undefined}
        tabIndex={log.new_case_names?.length > 0 ? 0 : undefined}
        aria-expanded={log.new_case_names?.length > 0 ? expanded : undefined}
        onKeyDown={log.new_case_names?.length > 0 ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); } } : undefined}
      >
        <div className="sync-log-icon">
          {isSync ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
            </svg>
          )}
        </div>
        <div className="sync-log-body">
          <span className="sync-log-title">
            {isSync ? 'Cypress Sync' : 'CircleCI Import'}
            <span className={`sync-log-status sync-log-status--${log.status}`}>{log.status}</span>
          </span>
          <span className="sync-log-meta">
            {timeAgo} &middot; {log.total_cases} cases &middot; {log.suites_processed} suites
            {log.new_cases > 0 && <span className="sync-log-new">+{log.new_cases} new</span>}
            {log.removed_cases > 0 && <span className="sync-log-removed">-{log.removed_cases} removed</span>}
          </span>
        </div>
        {log.new_case_names?.length > 0 && (
          <svg className={`sync-log-chevron ${expanded ? 'open' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
      {expanded && log.new_case_names?.length > 0 && (
        <div className="sync-log-details">
          <span className="sync-log-details-title">New test cases:</span>
          {log.new_case_names.map((name, i) => (
            <div key={i} className="sync-log-case">+ {name}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SuiteDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const ref = useRef(null);
  const listRef = useRef(null);

  const allOptions = ['', ...options];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const active = listRef.current.querySelector('[aria-selected="true"]');
      if (active) active.scrollIntoView({ block: 'nearest' });
      const idx = allOptions.indexOf(value || '');
      setFocusIdx(idx >= 0 ? idx : 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && listRef.current && focusIdx >= 0) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      if (items[focusIdx]) items[focusIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [focusIdx, open]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIdx(i => Math.min(i + 1, allOptions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIdx >= 0) { onChange(allOptions[focusIdx]); setOpen(false); }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'Home':
        e.preventDefault();
        setFocusIdx(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIdx(allOptions.length - 1);
        break;
      default: break;
    }
  };

  const label = value || 'All Suites';
  const activeDescendant = open && focusIdx >= 0 ? `suite-opt-${focusIdx}` : undefined;

  return (
    <div className="runs-suite-dropdown" ref={ref}>
      <button
        className="runs-suite-dropdown-btn"
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by suite"
        aria-activedescendant={activeDescendant}
        type="button"
      >
        <span className="runs-suite-dropdown-label">{label}</span>
        <svg className={`runs-suite-dropdown-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className="runs-suite-dropdown-menu" role="listbox" ref={listRef} aria-label="Suite filter options">
          <li
            id="suite-opt-0"
            className={`runs-suite-dropdown-item${!value ? ' runs-suite-dropdown-item--active' : ''}${focusIdx === 0 ? ' runs-suite-dropdown-item--focus' : ''}`}
            role="option"
            aria-selected={!value}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            All Suites
          </li>
          {options.map((name, i) => (
            <li
              key={name}
              id={`suite-opt-${i + 1}`}
              className={`runs-suite-dropdown-item${value === name ? ' runs-suite-dropdown-item--active' : ''}${focusIdx === i + 1 ? ' runs-suite-dropdown-item--focus' : ''}`}
              role="option"
              aria-selected={value === name}
              onClick={() => { onChange(name); setOpen(false); }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function DateRangePicker({ startDate, endDate, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = startDate || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [picking, setPicking] = useState(null); // null | Date (first click stored)
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Build calendar grid for current viewMonth
  const calendarDays = useMemo(() => {
    const { year, month } = viewMonth;
    const firstDay = new Date(year, month, 1);
    // Monday=0 offset
    let startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];
    // Previous month trailing days
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), outside: true });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), outside: false });
    }
    // Next month leading days to fill 6 rows
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({ date: new Date(year, month + 1, d), outside: true });
    }
    return days;
  }, [viewMonth]);

  const today = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const isInRange = (date) => {
    if (!startDate || !endDate) return false;
    return date >= startDate && date <= endDate;
  };

  const handleDayClick = (date) => {
    if (!picking) {
      // First click: set start
      setPicking(date);
    } else {
      // Second click: determine range order and apply
      let s = picking, e = date;
      if (s > e) { [s, e] = [e, s]; }
      setPicking(null);
      onChange(s, e);
      setOpen(false);
    }
  };

  const handleClear = () => {
    setPicking(null);
    onChange(null, null);
    setOpen(false);
  };

  const prevMonth = () => setViewMonth(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  const nextMonth = () => setViewMonth(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });

  const formatLabel = () => {
    if (!startDate && !endDate) return 'All dates';
    if (startDate && endDate) {
      const s = `${SHORT_MONTHS[startDate.getMonth()]} ${startDate.getDate()}`;
      const e = `${SHORT_MONTHS[endDate.getMonth()]} ${endDate.getDate()}`;
      if (startDate.getFullYear() !== endDate.getFullYear()) {
        return `${s}, ${startDate.getFullYear()} – ${e}, ${endDate.getFullYear()}`;
      }
      return `${s} – ${e}`;
    }
    if (startDate) return `From ${SHORT_MONTHS[startDate.getMonth()]} ${startDate.getDate()}`;
    return `Until ${SHORT_MONTHS[endDate.getMonth()]} ${endDate.getDate()}`;
  };

  return (
    <div className="drp-wrap" ref={wrapRef}>
      <button
        className="drp-btn"
        onClick={() => { setOpen(o => !o); if (!open) setPicking(null); }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="drp-label">{formatLabel()}</span>
        <svg className={`drp-chevron${open ? ' open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="drp-panel" role="dialog" aria-label="Date range picker">
          <div className="drp-month-nav">
            <button className="drp-nav-arrow" onClick={prevMonth} aria-label="Previous month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="drp-month-label">{MONTH_NAMES[viewMonth.month]} {viewMonth.year}</span>
            <button className="drp-nav-arrow" onClick={nextMonth} aria-label="Next month">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="drp-weekdays">
            {DAY_LABELS.map(d => <span key={d} className="drp-weekday">{d}</span>)}
          </div>
          <div className="drp-grid">
            {calendarDays.map(({ date, outside }, i) => {
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, startDate) || isSameDay(date, endDate);
              const isPicking = isSameDay(date, picking);
              const inRange = isInRange(date);
              return (
                <button
                  key={i}
                  className={[
                    'drp-day',
                    outside && 'drp-day--outside',
                    isToday && 'drp-day--today',
                    (isSelected || isPicking) && 'drp-day--selected',
                    inRange && !isSelected && 'drp-day--in-range',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleDayClick(date)}
                  aria-label={`${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="drp-footer">
            <button className="drp-clear" onClick={handleClear}>Clear</button>
            {picking && <span className="drp-hint">Select end date</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [suites, setSuites] = useState([]);
  const [runs, setRuns] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const setTab = (t) => setSearchParams(t === 'overview' ? {} : { tab: t }, { replace: true });

  // Suites tab: search, sort
  const [suiteSearch, setSuiteSearch] = useState('');
  const [suiteSort, setSuiteSort] = useState('name');

  // Runs tab: filter, search, selection state
  const [runStatusFilter, setRunStatusFilter] = useState('All');
  const [runSearchQuery, setRunSearchQuery] = useState('');
  const [runSuiteFilter, setRunSuiteFilter] = useState('');
  const [runDateStart, setRunDateStart] = useState(null);  // Date | null
  const [runDateEnd, setRunDateEnd] = useState(null);      // Date | null
  const [runSort, setRunSort] = useState({ key: 'created_at', dir: 'desc' });
  const [selectedRuns, setSelectedRuns] = useState(new Set());
  const [showBulkDeleteRuns, setShowBulkDeleteRuns] = useState(false);
  const [apiError, setApiError] = useState(null);

  // Test Health tab state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading2, setHealthLoading2] = useState(false);
  const [healthSuiteFilter, setHealthSuiteFilter] = useState(null);
  const [healthWindow, setHealthWindow] = useState(30);
  const [healthCategoryFilter, setHealthCategoryFilter] = useState('all');
  const [healthSortCol, setHealthSortCol] = useState('severity');
  const [healthSortDir, setHealthSortDir] = useState('desc');
  const [healthExpandedRow, setHealthExpandedRow] = useState(null);

  // Deep analysis state: { [caseId]: { loading, data, error, minimized } }
  const [deepAnalysis, setDeepAnalysis] = useState({});

  const startDeepAnalysis = useCallback(async (caseId) => {
    setDeepAnalysis(prev => ({
      ...prev,
      [caseId]: { loading: true, data: null, error: null, minimized: false },
    }));
    try {
      const data = await runService.analyzeTest(caseId, {
        project_id: Number(projectId),
        window: healthWindow,
      });
      setDeepAnalysis(prev => ({
        ...prev,
        [caseId]: { loading: false, data, error: null, minimized: false },
      }));
      // Play sound notification
      try {
        const { playConfirmation } = await import('../services/soundService.js');
        playConfirmation();
      } catch {}
    } catch (err) {
      setDeepAnalysis(prev => ({
        ...prev,
        [caseId]: { loading: false, data: null, error: err?.response?.data?.error || 'Analysis failed', minimized: false },
      }));
      try {
        const { playError } = await import('../services/soundService.js');
        playError();
      } catch {}
    }
  }, [projectId, healthWindow]);

  const toggleDeepMinimize = useCallback((caseId) => {
    setDeepAnalysis(prev => ({
      ...prev,
      [caseId]: { ...prev[caseId], minimized: !prev[caseId]?.minimized },
    }));
  }, []);

  const dismissDeepAnalysis = useCallback((caseId) => {
    setDeepAnalysis(prev => {
      const next = { ...prev };
      delete next[caseId];
      return next;
    });
  }, []);

  const filteredRuns = useMemo(() => {
    let result = runs;
    // Status filter — Active = not locked (today), Completed = locked (older)
    if (runStatusFilter === 'Active') result = result.filter(r => !r.is_locked);
    else if (runStatusFilter === 'Completed') result = result.filter(r => r.is_locked);
    // Suite filter
    if (runSuiteFilter) {
      result = result.filter(r => (r.suite_name || '') === runSuiteFilter);
    }
    // Date range filter
    if (runDateStart) {
      result = result.filter(r => new Date(r.created_at) >= runDateStart);
    }
    if (runDateEnd) {
      const endOfDay = new Date(runDateEnd);
      endOfDay.setHours(23, 59, 59, 999);
      result = result.filter(r => new Date(r.created_at) <= endOfDay);
    }
    // Search filter
    if (runSearchQuery.trim()) {
      const q = runSearchQuery.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.suite_name || '').toLowerCase().includes(q)
      );
    }
    // Sort
    result = [...result].sort((a, b) => {
      let av, bv;
      switch (runSort.key) {
        case 'name':
          av = a.name.toLowerCase(); bv = b.name.toLowerCase();
          return runSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'suite_name':
          av = (a.suite_name || '').toLowerCase(); bv = (b.suite_name || '').toLowerCase();
          return runSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'pass_rate':
          av = a.stats?.pass_rate ?? -1; bv = b.stats?.pass_rate ?? -1;
          return runSort.dir === 'asc' ? av - bv : bv - av;
        default: // created_at
          av = new Date(a.created_at); bv = new Date(b.created_at);
          return runSort.dir === 'asc' ? av - bv : bv - av;
      }
    });
    return result;
  }, [runs, runStatusFilter, runSearchQuery, runSuiteFilter, runDateStart, runDateEnd, runSort]);

  const runFilterStats = useMemo(() => ({
    All: runs.length,
    Active: runs.filter(r => !r.is_locked).length,
    Completed: runs.filter(r => r.is_locked).length,
  }), [runs]);

  const runSuiteNames = useMemo(() => {
    const names = new Set(runs.map(r => r.suite_name).filter(n => n && n !== 'All Suites'));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [runs]);

  const handleRunSort = (key) => {
    setRunSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' || key === 'suite_name' ? 'asc' : 'desc' }
    );
  };

  const runSortChevron = (key) => runSort.key === key ? (runSort.dir === 'asc' ? '\u25B2' : '\u25BC') : '';
  const runAriaSort = (key) => runSort.key === key ? (runSort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const handleRunSortKeyDown = (key, e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRunSort(key); } };
  const runHasActiveFilters = runStatusFilter !== 'All' || runSearchQuery || runSuiteFilter || runDateStart || runDateEnd;

  const toggleRunSelect = (id) => {
    setSelectedRuns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleRunSelectAll = () => {
    const visibleIds = filteredRuns.map(r => r.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedRuns.has(id));
    if (allSelected) {
      setSelectedRuns(new Set());
    } else {
      setSelectedRuns(new Set(visibleIds));
    }
  };

  const handleBulkDeleteRuns = async () => {
    try {
      await runService.bulkDelete([...selectedRuns]);
      setSelectedRuns(new Set());
      setShowBulkDeleteRuns(false);
      fetchAll();
    } catch { setApiError('Failed to delete runs. Please try again.'); }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, r, dash, logs] = await Promise.all([
        projectService.getById(projectId),
        suiteService.getByProject(projectId),
        runService.getByProject(projectId),
        dashboardService.getByProject(projectId, { date: todayStr }),
        dashboardService.getSyncLogs({ project_id: projectId, limit: 10 }),
      ]);
      setProject(p);
      setSuites(s);
      setRuns(r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setSyncLogs(logs);

      // If today has no suite stats, auto-fallback to the latest available date
      const dates = dash.run_dates || [];
      if (Object.keys(dash.suite_stats || {}).length === 0 && dates.length > 0) {
        const latestDate = dates[0];
        setHealthDate(latestDate);
        const fallbackDash = await dashboardService.getByProject(projectId, { date: latestDate });
        setDashboardData({ ...dash, suite_stats: fallbackDash.suite_stats, run_dates: fallbackDash.run_dates });
      } else {
        setDashboardData(dash);
      }
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Date filter for Suite Health — defaults to today
  const todayStr = new Date().toISOString().slice(0, 10);
  const [healthDate, setHealthDate] = useState(todayStr);
  const [healthLoading, setHealthLoading] = useState(false);
  const availableDates = dashboardData?.run_dates || [];

  const fetchHealthForDate = useCallback(async (date) => {
    setHealthLoading(true);
    try {
      const dash = await dashboardService.getByProject(projectId, { date });
      setDashboardData((prev) => ({
        ...prev,
        suite_stats: dash.suite_stats,
        run_dates: dash.run_dates,
      }));
    } catch { setApiError('Failed to load suite health data.'); }
    setHealthLoading(false);
  }, [projectId]);

  const fetchTestHealth = useCallback(async (suiteId, windowDays) => {
    setHealthLoading2(true);
    try {
      const data = await runService.getTestHealth(projectId, {
        suite_id: suiteId || undefined,
        window: windowDays,
      });
      setHealthData(data);
    } catch { setApiError('Failed to load test health data.'); }
    setHealthLoading2(false);
  }, [projectId]);

  const navigateDate = (direction) => {
    const idx = availableDates.indexOf(healthDate);
    if (direction === 'prev') {
      const nextIdx = idx === -1 ? 0 : idx + 1;
      if (nextIdx < availableDates.length) {
        const newDate = availableDates[nextIdx];
        setHealthDate(newDate);
        fetchHealthForDate(newDate);
      }
    } else {
      const nextIdx = idx - 1;
      if (nextIdx >= 0) {
        const newDate = availableDates[nextIdx];
        setHealthDate(newDate);
        fetchHealthForDate(newDate);
      }
    }
  };

  const canGoPrev = (() => {
    const idx = availableDates.indexOf(healthDate);
    return idx === -1 ? availableDates.length > 0 : idx < availableDates.length - 1;
  })();
  const canGoNext = (() => {
    const idx = availableDates.indexOf(healthDate);
    return idx > 0;
  })();

  useEffect(() => { fetchAll(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab === 'health' && !healthData && !healthLoading2) {
      fetchTestHealth(healthSuiteFilter, healthWindow);
    }
  }, [tab, healthData, healthLoading2, fetchTestHealth, healthSuiteFilter, healthWindow]);

  if (loading) return <><Header breadcrumbs={[{ label: 'Guardian' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <Header breadcrumbs={[{ label: project?.name }]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">{project?.name}</h2>
            {project?.description && <p className="page-description">{project.description}</p>}
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Project sections">
          <button className={`tab ${tab === 'overview' ? 'active' : ''}`} role="tab" id="tab-overview" aria-selected={tab === 'overview'} aria-controls={tab === 'overview' ? 'panel-overview' : undefined} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={`tab ${tab === 'suites' ? 'active' : ''}`} role="tab" id="tab-suites" aria-selected={tab === 'suites'} aria-controls={tab === 'suites' ? 'panel-suites' : undefined} onClick={() => setTab('suites')}>
            Test Suites ({suites.length})
          </button>
          <button className={`tab ${tab === 'runs' ? 'active' : ''}`} role="tab" id="tab-runs" aria-selected={tab === 'runs'} aria-controls={tab === 'runs' ? 'panel-runs' : undefined} onClick={() => setTab('runs')}>
            Test Runs ({runs.length})
          </button>
          <button className={`tab ${tab === 'health' ? 'active' : ''}`} role="tab" id="tab-health" aria-selected={tab === 'health'} aria-controls={tab === 'health' ? 'panel-health' : undefined} onClick={() => setTab('health')}>
            Test Health
          </button>
        </div>

        {apiError && (
          <div className="api-error-banner" role="alert">
            <span>{apiError}</span>
            <button className="api-error-dismiss" aria-label="Dismiss error" onClick={() => setApiError(null)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {tab === 'suites' && (<div id="panel-suites" role="tabpanel" aria-labelledby="tab-suites">{(() => {
          const activeRunsBySuite = {};
          runs.filter(r => !r.is_completed && r.suite_id).forEach(r => {
            activeRunsBySuite[r.suite_id] = (activeRunsBySuite[r.suite_id] || 0) + 1;
          });

          // Derive latest run stats per suite from runs data
          const latestRunBySuite = {};
          [...runs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(r => {
            if (r.suite_id && !latestRunBySuite[r.suite_id]) {
              latestRunBySuite[r.suite_id] = r;
            }
          });

          // Filter suites by search
          let displaySuites = suites;
          if (suiteSearch.trim()) {
            const q = suiteSearch.toLowerCase();
            displaySuites = displaySuites.filter(s => s.name.toLowerCase().includes(q));
          }

          // Sort suites
          displaySuites = [...displaySuites].sort((a, b) => {
            if (suiteSort === 'name') return a.name.localeCompare(b.name);
            if (suiteSort === 'cases') return (b.case_count || 0) - (a.case_count || 0);
            if (suiteSort === 'pass_rate') {
              const rateA = latestRunBySuite[a.id]?.stats?.pass_rate ?? -1;
              const rateB = latestRunBySuite[b.id]?.stats?.pass_rate ?? -1;
              return rateA - rateB; // worst first
            }
            if (suiteSort === 'last_run') {
              const dateA = latestRunBySuite[a.id]?.created_at || '';
              const dateB = latestRunBySuite[b.id]?.created_at || '';
              return dateB.localeCompare(dateA); // most recent first
            }
            return 0;
          });

          return (
            <div>
              {/* Toolbar */}
              <div className="suites-filter-toolbar">
                <div className="runs-search-wrapper">
                  <svg className="runs-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="runs-search-input"
                    type="text"
                    placeholder="Search suites..."
                    aria-label="Search suites"
                    value={suiteSearch}
                    onChange={e => setSuiteSearch(e.target.value)}
                  />
                  {suiteSearch && (
                    <button className="runs-search-clear" aria-label="Clear suite search" onClick={() => setSuiteSearch('')}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="suites-sort">
                  <label className="suites-sort-label" htmlFor="suites-sort">Sort by</label>
                  <select id="suites-sort" className="suites-sort-select" value={suiteSort} onChange={e => setSuiteSort(e.target.value)}>
                    <option value="name">Name</option>
                    <option value="cases">Most Cases</option>
                    <option value="pass_rate">Worst Pass Rate</option>
                    <option value="last_run">Last Tested</option>
                  </select>
                </div>
              </div>

              {suiteSearch && (
                <div className="runs-active-filter">
                  Showing {displaySuites.length} of {suites.length} suites
                  <button className="runs-clear-filters" onClick={() => setSuiteSearch('')}>Clear</button>
                </div>
              )}

              {displaySuites.length > 0 ? (
                <div className="suite-list">
                  {displaySuites.map((s) => {
                    const activeCount = activeRunsBySuite[s.id] || 0;
                    const latestRun = latestRunBySuite[s.id];
                    const passRate = latestRun?.stats?.pass_rate;
                    const total = latestRun?.stats?.total || 0;
                    const passRateColor = passRate >= 80 ? 'var(--status-passed)' : passRate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';
                    return (
                      <div key={s.id} className="suite-card">
                        <div className="suite-card-icon">
                          {passRate != null ? (
                            <span className="suite-card-rate" style={{ color: passRateColor }}>{passRate}%</span>
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sidebar-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          )}
                        </div>
                        <div className="suite-card-body">
                          <Link to={`/projects/${projectId}/suites/${s.id}`} className="suite-card-name">{s.name}</Link>
                          <div className="suite-card-summary">
                            {s.case_count || 0} cases &middot; {s.section_count || 0} sections
                            {activeCount > 0
                              ? <> &middot; <strong>{activeCount} active run{activeCount !== 1 ? 's' : ''}</strong></>
                              : null}
                            {latestRun && (
                              <> &middot; tested {(() => {
                                const d = new Date(latestRun.created_at);
                                const now = new Date();
                                const diff = now - d;
                                const mins = Math.floor(diff / 60000);
                                if (mins < 60) return `${mins}m ago`;
                                const hours = Math.floor(mins / 60);
                                if (hours < 24) return `${hours}h ago`;
                                const days = Math.floor(hours / 24);
                                if (days < 7) return `${days}d ago`;
                                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              })()}</>
                            )}
                          </div>
                          {latestRun && total > 0 && (
                            <div className="suite-card-bar-row">
                              <div className="suite-card-bar">
                                {STATUS_ORDER.map((st) =>
                                  latestRun.stats[st] > 0 ? (
                                    <div
                                      key={st}
                                      style={{
                                        width: `${(latestRun.stats[st] / total) * 100}%`,
                                        backgroundColor: `var(--status-${st.toLowerCase()})`,
                                      }}
                                      title={`${st}: ${latestRun.stats[st]}`}
                                    />
                                  ) : null
                                )}
                              </div>
                              <div className="suite-card-stat-badges">
                                {STATUS_ORDER.map((st) =>
                                  latestRun.stats[st] > 0 ? (
                                    <span key={st} className="suite-card-stat-badge" style={{ '--badge-bg': `var(--status-${st.toLowerCase()}-bg)`, '--badge-color': `var(--status-${st.toLowerCase()})` }}>
                                      {latestRun.stats[st]}
                                    </span>
                                  ) : null
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <Link to={`/projects/${projectId}/suites/${s.id}`} className="suite-card-chevron" title="Open suite">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-message">{suites.length > 0 ? 'No suites match your search.' : 'No test suites yet.'}</p>
              )}
            </div>
          );
        })()}</div>)}

        {tab === 'runs' && (
          <div id="panel-runs" role="tabpanel" aria-labelledby="tab-runs">
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
                  <button className="runs-search-clear" aria-label="Clear run search" onClick={() => { setRunSearchQuery(''); setSelectedRuns(new Set()); }}>
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
                <button className="runs-clear-filters" onClick={() => { setRunStatusFilter('All'); setRunSearchQuery(''); setRunSuiteFilter(''); setRunDateStart(null); setRunDateEnd(null); setSelectedRuns(new Set()); }}>
                  Clear filters
                </button>
              </div>
            )}

            <div className="card">
              {filteredRuns.length > 0 ? (
                <table className="data-table">
                  <caption className="sr-only">Test runs for {project?.name}</caption>
                  <thead>
                    <tr>
                      <th className="runs-checkbox-col">
                        <input
                          type="checkbox"
                          aria-label="Select all runs"
                          checked={filteredRuns.length > 0 && filteredRuns.every(r => selectedRuns.has(r.id))}
                          onChange={toggleRunSelectAll}
                        />
                      </th>
                      <th scope="col" className="runs-col-sortable" role="columnheader" aria-sort={runAriaSort('name')} tabIndex={0} onClick={() => handleRunSort('name')} onKeyDown={e => handleRunSortKeyDown('name', e)}>Name {runSortChevron('name') && <span className="runs-sort-chevron">{runSortChevron('name')}</span>}</th>
                      <th scope="col" className="runs-col-sortable" role="columnheader" aria-sort={runAriaSort('suite_name')} tabIndex={0} onClick={() => handleRunSort('suite_name')} onKeyDown={e => handleRunSortKeyDown('suite_name', e)}>Suite {runSortChevron('suite_name') && <span className="runs-sort-chevron">{runSortChevron('suite_name')}</span>}</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="runs-col-sortable" role="columnheader" aria-sort={runAriaSort('pass_rate')} tabIndex={0} onClick={() => handleRunSort('pass_rate')} onKeyDown={e => handleRunSortKeyDown('pass_rate', e)}>Pass Rate {runSortChevron('pass_rate') && <span className="runs-sort-chevron">{runSortChevron('pass_rate')}</span>}</th>
                      <th scope="col" className="runs-col-sortable runs-created-col" role="columnheader" aria-sort={runAriaSort('created_at')} tabIndex={0} onClick={() => handleRunSort('created_at')} onKeyDown={e => handleRunSortKeyDown('created_at', e)}>Created {runSortChevron('created_at') && <span className="runs-sort-chevron">{runSortChevron('created_at')}</span>}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRuns.map((r) => (
                      <tr key={r.id} className={`clickable-row${selectedRuns.has(r.id) ? ' runs-row--selected' : ''}`} onClick={() => navigate(`/runs/${r.id}`)} tabIndex={0} role="row" onKeyDown={e => { if (e.key === 'Enter') navigate(`/runs/${r.id}`); }}>
                        <td className="runs-checkbox-col" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select run ${r.name}`}
                            checked={selectedRuns.has(r.id)}
                            onChange={() => toggleRunSelect(r.id)}
                          />
                        </td>
                        <td className="text-primary-bold">{r.name}</td>
                        <td>{r.suite_name}</td>
                        <td>{r.is_locked ? <span className="badge-completed">Completed</span> : <span className="badge-active">Active</span>}</td>
                        <td>
                          <div className="mini-bar">
                            {['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'].map((s) => (
                              r.stats[s] > 0 && (
                                <div key={s} style={{ width: `${(r.stats[s] / r.stats.total) * 100}%`, backgroundColor: `var(--status-${s.toLowerCase()})` }} title={`${s}: ${r.stats[s]}`} />
                              )
                            ))}
                          </div>
                          <span className="mini-bar-label">{r.stats.pass_rate}%</span>
                        </td>
                        <td className="text-muted runs-created-col">{new Date(r.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="empty-message">{runs.length > 0 ? 'No runs match the current filters.' : 'No test runs yet.'}</p>
              )}
            </div>

            {/* Floating bulk action bar */}
            {selectedRuns.size > 0 && (
              <div className="bulk-action-bar">
                <span className="bulk-action-count">{selectedRuns.size} run{selectedRuns.size !== 1 ? 's' : ''} selected</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedRuns(new Set())}>Clear</button>
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
        )}

        {tab === 'health' && (<div id="panel-health" role="tabpanel" aria-labelledby="tab-health">{(() => {
          const CATEGORY_COLORS = {
            flaky: '#FF9800', always_failing: '#d32f2f', consistently_failing: '#F44336', regression: '#9C27B0',
          };
          const CATEGORY_LABELS = {
            flaky: 'Flaky', always_failing: 'Always Failing', consistently_failing: 'Consistently Failing', regression: 'Regression',
          };
          const CONFIDENCE_LABELS = { low: 'Low Confidence', medium: 'Medium Confidence', high: 'High Confidence' };
          const CONFIDENCE_COLORS = { low: '#FF9800', medium: '#5f6d64', high: '#4CAF50' };
          const CONFIDENCE_BGS = { low: '#FFF3E0', medium: '#f0f4f1', high: '#E8F5E9' };
          const STATUS_DOT_COLORS = { Passed: '#4CAF50', Failed: '#F44336', Blocked: '#FF9800', Retest: '#00897B', Untested: '#9E9E9E' };

          const hd = healthData;
          const summary = hd?.summary || {};
          const tests = hd?.tests || [];
          const hasIssues = tests.length > 0;
          const totalIssues = (summary.flaky || 0) + (summary.always_failing || 0) + (summary.consistently_failing || 0) + (summary.regression || 0);

          // Apply category filter
          const filteredTests = healthCategoryFilter === 'all'
            ? tests
            : tests.filter(t => t.category === healthCategoryFilter);

          // Apply sorting
          const sortedTests = [...filteredTests].sort((a, b) => {
            let av, bv;
            switch (healthSortCol) {
              case 'title': av = a.title.toLowerCase(); bv = b.title.toLowerCase(); return healthSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
              case 'suite': av = a.suite_name; bv = b.suite_name; return healthSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
              case 'category': av = a.category; bv = b.category; return healthSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
              case 'ewma': av = a.ewma_flip_rate; bv = b.ewma_flip_rate; break;
              case 'fail_rate': av = a.failure_rate; bv = b.failure_rate; break;
              case 'disruptions': av = a.disruption_count; bv = b.disruption_count; break;
              default: av = a.severity; bv = b.severity;
            }
            return healthSortDir === 'asc' ? av - bv : bv - av;
          });

          const handleSort = (col) => {
            if (healthSortCol === col) {
              setHealthSortDir(d => d === 'asc' ? 'desc' : 'asc');
            } else {
              setHealthSortCol(col);
              setHealthSortDir('desc');
            }
          };

          const sortIcon = (col) => healthSortCol === col ? (healthSortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
          const ariaSort = (col) => healthSortCol === col ? (healthSortDir === 'asc' ? 'ascending' : 'descending') : 'none';

          return (
            <div className="th-container">
              {/* Controls toolbar */}
              <div className="th-toolbar">
                <div className="th-toolbar-left">
                  <select
                    className="th-suite-select"
                    aria-label="Filter by suite"
                    value={healthSuiteFilter || ''}
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setHealthSuiteFilter(val);
                      setHealthData(null);
                      fetchTestHealth(val, healthWindow);
                    }}
                  >
                    <option value="">All Suites</option>
                    {suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div className="th-window-pills">
                    {[7, 14, 30].map(d => (
                      <button
                        key={d}
                        className={`th-window-pill${healthWindow === d ? ' th-window-pill--active' : ''}`}
                        onClick={() => {
                          setHealthWindow(d);
                          setHealthData(null);
                          fetchTestHealth(healthSuiteFilter, d);
                        }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                {hd && hd.confidence !== 'insufficient' && (
                  <div className="th-toolbar-right">
                    <span className="th-runs-analyzed">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }}>
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      {hd.runs_analyzed} runs &middot; {summary.total_analyzed || 0} tests analyzed
                    </span>
                    {hd.confidence && (
                      <span className="th-confidence-badge" style={{ color: CONFIDENCE_COLORS[hd.confidence], borderColor: CONFIDENCE_COLORS[hd.confidence], background: CONFIDENCE_BGS[hd.confidence] }}>
                        {CONFIDENCE_LABELS[hd.confidence]}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {healthLoading2 ? (
                <LoadingSpinner />
              ) : hd?.confidence === 'insufficient' ? (
                /* Insufficient data state */
                <div className="th-insufficient">
                  <div className="th-insufficient-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF9800" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <h3 className="th-insufficient-title">Not Enough Data Yet</h3>
                  <p className="th-insufficient-text">
                    Test health analysis requires at least <strong>{hd.min_runs_required} completed runs</strong> to reliably
                    detect flaky and failing patterns.
                  </p>
                  <div className="th-insufficient-progress">
                    <div className="th-insufficient-bar">
                      <div className="th-insufficient-bar-fill" style={{ width: `${Math.min((hd.runs_analyzed / hd.min_runs_required) * 100, 100)}%` }} />
                    </div>
                    <span className="th-insufficient-bar-label">{hd.runs_analyzed} / {hd.min_runs_required} runs</span>
                  </div>
                  <p className="th-insufficient-sub">Import more CircleCI results or try a wider time window.</p>
                </div>
              ) : hd ? (
                <>
                  {hasIssues ? (
                    <>
                      {/* Summary tiles — only shown when there are issues */}
                      <div className="th-tiles">
                        {[
                          { key: 'flaky', iconEl: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          )},
                          { key: 'always_failing', iconEl: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                          )},
                          { key: 'consistently_failing', iconEl: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          )},
                          { key: 'regression', iconEl: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                            </svg>
                          )},
                        ].map(({ key, iconEl }) => {
                          const count = summary[key] || 0;
                          const total = (summary.flaky || 0) + (summary.always_failing || 0) + (summary.consistently_failing || 0) + (summary.regression || 0);
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                          return (
                          <button
                            key={key}
                            className={`th-tile${healthCategoryFilter === key ? ' th-tile--active' : ''}${count === 0 ? ' th-tile--zero' : ''}`}
                            style={{ '--tile-accent': CATEGORY_COLORS[key] }}
                            onClick={() => setHealthCategoryFilter(f => f === key ? 'all' : key)}
                          >
                            <div className="th-tile-icon-wrap">{iconEl}</div>
                            <div className="th-tile-body">
                              <span className="th-tile-count">{count}</span>
                              <span className="th-tile-label">{CATEGORY_LABELS[key]}</span>
                            </div>
                            {count > 0 && <div className="th-tile-bar"><div className="th-tile-bar-fill" style={{ width: `${pct}%` }} /></div>}
                            {count > 0 && <span className="th-tile-pct">{pct}% of issues</span>}
                          </button>
                          );
                        })}
                      </div>

                      {/* Category filter pills */}
                      <div className="th-filter-pills">
                        {['all', 'flaky', 'always_failing', 'consistently_failing', 'regression'].map(f => {
                          const count = f === 'all' ? tests.length : tests.filter(t => t.category === f).length;
                          if (f !== 'all' && count === 0) return null;
                          return (
                            <button
                              key={f}
                              className={`th-filter-pill${healthCategoryFilter === f ? ' th-filter-pill--active' : ''}`}
                              onClick={() => setHealthCategoryFilter(f)}
                            >
                              {f === 'all' ? `All Issues` : CATEGORY_LABELS[f]}
                              <span className="th-filter-pill-count">{count}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Test table */}
                      {sortedTests.length > 0 && (
                        <div className="th-table-wrap">
                          <table className="th-table">
                            <thead>
                              <tr>
                                <th className="th-col-name" scope="col" aria-sort={ariaSort('title')} onClick={() => handleSort('title')}>Test Name{sortIcon('title')}</th>
                                <th className="th-col-suite" scope="col" aria-sort={ariaSort('suite')} onClick={() => handleSort('suite')}>Suite{sortIcon('suite')}</th>
                                <th className="th-col-cat" scope="col" aria-sort={ariaSort('category')} onClick={() => handleSort('category')}>Category{sortIcon('category')}</th>
                                <th className="th-col-ewma" scope="col" aria-sort={ariaSort('ewma')} onClick={() => handleSort('ewma')}>Flakiness{sortIcon('ewma')}</th>
                                <th className="th-col-fail" scope="col" aria-sort={ariaSort('fail_rate')} onClick={() => handleSort('fail_rate')}>Fail Rate{sortIcon('fail_rate')}</th>
                                <th className="th-col-disruptions" scope="col" aria-sort={ariaSort('disruptions')} onClick={() => handleSort('disruptions')}>Disruptions{sortIcon('disruptions')}</th>
                                <th className="th-col-root" scope="col">Root Cause</th>
                                <th className="th-col-trend" scope="col">Trend</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedTests.map(t => {
                                const isExpanded = healthExpandedRow === t.case_id;
                                const d = t.diagnostics;
                                return (
                                  <React.Fragment key={t.case_id}>
                                    <tr
                                      className={`th-row${isExpanded ? ' th-row--expanded' : ''}`}
                                      onClick={() => setHealthExpandedRow(isExpanded ? null : t.case_id)}
                                      tabIndex={0}
                                      role="button"
                                      aria-expanded={isExpanded}
                                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHealthExpandedRow(isExpanded ? null : t.case_id); } }}
                                    >
                                      <td className="th-col-name">
                                        <div className="th-test-name">{t.title}</div>
                                        <div className="th-test-section">{t.section_name}</div>
                                      </td>
                                      <td className="th-col-suite">{t.suite_name}</td>
                                      <td className="th-col-cat">
                                        <span className="th-cat-badge" style={{ color: CATEGORY_COLORS[t.category], backgroundColor: CATEGORY_COLORS[t.category] + '18' }}>
                                          {CATEGORY_LABELS[t.category]}
                                        </span>
                                      </td>
                                      <td className="th-col-ewma">
                                        <div className="th-ewma-bar-wrap">
                                          <div className="th-ewma-bar" style={{ width: `${Math.min(t.ewma_flip_rate * 100, 100)}%` }} />
                                        </div>
                                        <span className="th-ewma-val">{Math.round(t.ewma_flip_rate * 100)}%</span>
                                      </td>
                                      <td className="th-col-fail">{Math.round(t.failure_rate * 100)}%</td>
                                      <td className="th-col-disruptions">{t.disruption_count}</td>
                                      <td className="th-col-root">
                                        {d?.error_label ? (
                                          <span className="th-root-badge">{d.error_label}</span>
                                        ) : <span className="th-root-none">--</span>}
                                      </td>
                                      <td className="th-col-trend">
                                        <div className="th-trend-dots" aria-label={`Last ${t.trend.length}: ${Object.entries(t.trend.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {})).map(([k, v]) => `${v} ${k}`).join(', ')}`}>
                                          {t.trend.map((s, i) => (
                                            <span key={i} className="th-trend-dot" style={{ backgroundColor: STATUS_DOT_COLORS[s] || '#9E9E9E' }} title={s} aria-hidden="true" />
                                          ))}
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Expanded diagnostics row */}
                                    {isExpanded && (
                                      <tr className="th-detail-row">
                                        <td colSpan="8">
                                          <div className="th-detail">
                                            {/* Stats summary */}
                                            <div className="th-detail-stats">
                                              <span>{t.total_runs} runs</span>
                                              <span className="th-dot">&middot;</span>
                                              <span style={{ color: '#4CAF50' }}>{t.pass_count} passed</span>
                                              <span className="th-dot">&middot;</span>
                                              <span style={{ color: '#F44336' }}>{t.fail_count} failed</span>
                                              {t.block_count > 0 && <><span className="th-dot">&middot;</span><span style={{ color: '#FF9800' }}>{t.block_count} blocked</span></>}
                                              <span className="th-dot">&middot;</span>
                                              <span>Streak: {t.streak} {t.streak_status}</span>
                                              {t.confidence && t.confidence !== 'high' && (
                                                <>
                                                  <span className="th-dot">&middot;</span>
                                                  <span className="th-confidence-inline" style={{ color: CONFIDENCE_COLORS[t.confidence] }}>
                                                    {CONFIDENCE_LABELS[t.confidence]}
                                                  </span>
                                                </>
                                              )}
                                            </div>

                                            {/* Same-commit flaky badge */}
                                            {t.same_commit_flaky && (
                                              <div className="th-same-commit">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF9800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                </svg>
                                                Same-Commit Flaky — passed and failed on the same commit SHA
                                              </div>
                                            )}

                                            <div className="th-detail-grid">
                                              {/* Root Cause panel */}
                                              {d?.suggestion && (
                                                <div className="th-detail-panel">
                                                  <div className="th-detail-panel-title">Root Cause Analysis</div>
                                                  {d.error_label && <span className="th-root-badge" style={{ marginBottom: 8, display: 'inline-block' }}>{d.error_label}</span>}
                                                  <p className="th-detail-suggestion">{d.suggestion}</p>
                                                </div>
                                              )}

                                              {/* Code Quality panel */}
                                              {d?.code_smells?.length > 0 && (
                                                <div className="th-detail-panel">
                                                  <div className="th-detail-panel-title">
                                                    Code Quality
                                                    {d.source_file && <span className="th-source-file">{d.source_file}</span>}
                                                  </div>
                                                  <div className="th-smell-list">
                                                    {d.code_smells.map((cs, i) => (
                                                      <div key={i} className="th-smell-item">
                                                        <span className="th-smell-badge">{cs.label}{cs.occurrences > 1 ? ` (×${cs.occurrences})` : ''}</span>
                                                        <span className="th-smell-suggestion">{cs.suggestion}</span>
                                                        {cs.examples?.length > 0 && (
                                                          <div className="th-smell-examples">
                                                            {cs.examples.map((ex, j) => (
                                                              <code key={j} className="th-smell-code">L{ex.line}: {ex.code}</code>
                                                            ))}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                              )}
                                            </div>

                                            {/* Latest error message */}
                                            {d?.last_error && (
                                              <div className="th-detail-panel">
                                                <div className="th-detail-panel-title">Latest Error</div>
                                                <pre className="th-error-pre">{d.last_error}</pre>
                                              </div>
                                            )}

                                            {/* Artifacts */}
                                            {d?.recent_artifacts?.length > 0 && (
                                              <div className="th-detail-panel">
                                                <div className="th-detail-panel-title">Artifacts</div>
                                                <div className="th-artifacts">
                                                  {d.recent_artifacts.map((art, i) => (
                                                    <a key={i} href={art.url} target="_blank" rel="noopener noreferrer" className="th-artifact-link">
                                                      {art.name || 'Artifact'}
                                                    </a>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            <div className="th-detail-actions">
                                              <Link to={`/cases/${t.case_id}`} className="th-view-case">View Test Case</Link>
                                              {!deepAnalysis[t.case_id] && (
                                                <button
                                                  className="th-investigate-btn"
                                                  onClick={(e) => { e.stopPropagation(); startDeepAnalysis(t.case_id); }}
                                                >
                                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                                  </svg>
                                                  Investigate
                                                </button>
                                              )}
                                            </div>

                                            {/* Deep analysis panel */}
                                            {deepAnalysis[t.case_id] && (() => {
                                              const da = deepAnalysis[t.case_id];
                                              return (
                                                <div className={`th-deep-analysis${da.minimized ? ' th-deep-analysis--minimized' : ''}`}>
                                                  <div className="th-deep-header">
                                                    <div className="th-deep-header-left">
                                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                                      </svg>
                                                      <span className="th-deep-header-title">Deep Analysis</span>
                                                      {da.loading && <span className="th-deep-status th-deep-status--loading">Researching...</span>}
                                                      {da.data && <span className="th-deep-status th-deep-status--done">Complete</span>}
                                                      {da.error && <span className="th-deep-status th-deep-status--error">Failed</span>}
                                                    </div>
                                                    <div className="th-deep-header-actions">
                                                      <button className="th-deep-minimize" onClick={(e) => { e.stopPropagation(); toggleDeepMinimize(t.case_id); }} title={da.minimized ? 'Expand' : 'Minimize'}>
                                                        {da.minimized ? (
                                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                                                        ) : (
                                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                                                        )}
                                                      </button>
                                                      <button className="th-deep-dismiss" onClick={(e) => { e.stopPropagation(); dismissDeepAnalysis(t.case_id); }} title="Dismiss">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {da.loading && !da.minimized && (
                                                    <div className="th-deep-loading">
                                                      <div className="th-deep-loading-bar" />
                                                      <p>Analyzing error patterns across all runs, fetching test source code, searching app repos for selectors, correlating commits...</p>
                                                    </div>
                                                  )}

                                                  {da.error && !da.minimized && (
                                                    <div className="th-deep-error">
                                                      <p>{da.error}</p>
                                                      <button className="th-investigate-btn" onClick={(e) => { e.stopPropagation(); startDeepAnalysis(t.case_id); }}>Retry</button>
                                                    </div>
                                                  )}

                                                  {da.data && !da.minimized && (() => {
                                                    const { error_analysis, test_source, selectors, app_references, commit_analysis, code_smells, diagnosis } = da.data;
                                                    return (
                                                      <div className="th-deep-body">
                                                        {/* Diagnosis summary */}
                                                        {diagnosis && (
                                                          <div className="th-deep-section th-deep-diagnosis">
                                                            <div className="th-deep-section-title">Diagnosis</div>
                                                            {diagnosis.findings?.map((f, i) => (
                                                              <p key={i} className="th-deep-finding">{f}</p>
                                                            ))}
                                                            {diagnosis.fix_suggestions?.length > 0 && (
                                                              <div className="th-deep-fixes">
                                                                <strong>Suggested Fixes:</strong>
                                                                {diagnosis.fix_suggestions.map((s, i) => (
                                                                  <p key={i} className="th-deep-fix">{s}</p>
                                                                ))}
                                                              </div>
                                                            )}
                                                          </div>
                                                        )}

                                                        {/* Error patterns */}
                                                        {error_analysis && error_analysis.distinct_patterns > 0 && (
                                                          <div className="th-deep-section">
                                                            <div className="th-deep-section-title">
                                                              Error Patterns
                                                              <span className="th-deep-badge">{error_analysis.distinct_patterns} distinct across {error_analysis.total_failures} failures</span>
                                                            </div>
                                                            {error_analysis.groups?.map((g, i) => (
                                                              <div key={i} className="th-deep-error-group">
                                                                <div className="th-deep-error-group-header">
                                                                  <span className="th-deep-error-pct">{g.percentage}%</span>
                                                                  <span className="th-deep-error-count">({g.count}x)</span>
                                                                </div>
                                                                <pre className="th-deep-error-pattern">{g.pattern}</pre>
                                                                {g.runs?.length > 0 && (
                                                                  <div className="th-deep-error-runs">Runs: {g.runs.join(', ')}</div>
                                                                )}
                                                              </div>
                                                            ))}
                                                          </div>
                                                        )}

                                                        {/* Test source code */}
                                                        {test_source?.block && (
                                                          <div className="th-deep-section">
                                                            <div className="th-deep-section-title">
                                                              Test Source
                                                              {test_source.file && <span className="th-source-file">{test_source.file.split('/').pop()}</span>}
                                                            </div>
                                                            <pre className="th-deep-code">{test_source.block.lines?.map(l =>
                                                              `${String(l.line).padStart(4)}  ${l.code}`
                                                            ).join('\n')}</pre>
                                                          </div>
                                                        )}

                                                        {/* App references */}
                                                        {app_references?.length > 0 && (
                                                          <div className="th-deep-section">
                                                            <div className="th-deep-section-title">
                                                              App Code References
                                                              <span className="th-deep-badge">{app_references.length} files</span>
                                                            </div>
                                                            <div className="th-deep-refs">
                                                              {app_references.map((ref, i) => (
                                                                <a key={i} href={ref.url} target="_blank" rel="noopener noreferrer" className="th-deep-ref">
                                                                  <span className="th-deep-ref-repo">{ref.repo}</span>
                                                                  <span className="th-deep-ref-path">{ref.path}</span>
                                                                </a>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}

                                                        {/* Commit correlation */}
                                                        {commit_analysis && commit_analysis.total_commits > 0 && (
                                                          <div className="th-deep-section">
                                                            <div className="th-deep-section-title">Commit Correlation</div>
                                                            {commit_analysis.same_commit_flaky && (
                                                              <p className="th-deep-finding" style={{ color: '#FF9800' }}>
                                                                Passes AND fails on the same commit — confirmed non-deterministic (true flake).
                                                              </p>
                                                            )}
                                                            <div className="th-deep-commits">
                                                              {commit_analysis.commit_breakdown?.map((c, i) => (
                                                                <div key={i} className="th-deep-commit">
                                                                  <code className="th-deep-commit-sha">{c.sha}</code>
                                                                  {c.passed > 0 && <span className="th-deep-commit-pass">{c.passed}P</span>}
                                                                  {c.failed > 0 && <span className="th-deep-commit-fail">{c.failed}F</span>}
                                                                  {c.blocked > 0 && <span className="th-deep-commit-block">{c.blocked}B</span>}
                                                                </div>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}

                                                        {/* Code smells (from deep analysis) */}
                                                        {code_smells?.length > 0 && (
                                                          <div className="th-deep-section">
                                                            <div className="th-deep-section-title">Code Quality Issues</div>
                                                            <div className="th-smell-list">
                                                              {code_smells.map((cs, i) => (
                                                                <div key={i} className="th-smell-item">
                                                                  <span className="th-smell-badge">{cs.label}{cs.occurrences > 1 ? ` (x${cs.occurrences})` : ''}</span>
                                                                  <span className="th-smell-suggestion">{cs.suggestion}</span>
                                                                  {cs.examples?.length > 0 && (
                                                                    <div className="th-smell-examples">
                                                                      {cs.examples.map((ex, j) => (
                                                                        <code key={j} className="th-smell-code">L{ex.line}: {ex.code}</code>
                                                                      ))}
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  ) : (
                    /* All healthy — clean summary card */
                    <div className="th-healthy">
                      <div className="th-healthy-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </div>
                      <h3 className="th-healthy-title">All Tests Are Healthy</h3>
                      <p className="th-healthy-text">
                        No flaky, failing, or regressed tests detected across <strong>{summary.total_analyzed || 0}</strong> tests
                        in <strong>{hd.runs_analyzed}</strong> runs over the last {healthWindow} days.
                      </p>
                      <div className="th-healthy-stats">
                        <div className="th-healthy-stat">
                          <span className="th-healthy-stat-val">{summary.total_analyzed || 0}</span>
                          <span className="th-healthy-stat-label">Tests Analyzed</span>
                        </div>
                        <div className="th-healthy-stat-divider" />
                        <div className="th-healthy-stat">
                          <span className="th-healthy-stat-val">{hd.runs_analyzed}</span>
                          <span className="th-healthy-stat-label">Runs Checked</span>
                        </div>
                        <div className="th-healthy-stat-divider" />
                        <div className="th-healthy-stat">
                          <span className="th-healthy-stat-val">0</span>
                          <span className="th-healthy-stat-label">Issues Found</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          );
        })()}</div>)}

        {tab === 'overview' && (<div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">{(() => {
          const totalCases = suites.reduce((sum, s) => sum + (s.case_count || 0), 0);
          const totalSections = suites.reduce((sum, s) => sum + (s.section_count || 0), 0);

          // Per-suite stats from backend (derived from test case suite membership)
          const suiteStatsMap = dashboardData?.suite_stats || {};

          return (
            <div className="ov-overview">
              {/* Project Summary Tiles */}
              <div className="ov-stats">
                <div className="ov-tiles">
                  <div className="ov-stat-tile">
                    <div className="ov-stat-tile-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <span className="ov-stat-tile-count">{totalCases}</span>
                    <span className="ov-stat-tile-label">Test Cases</span>
                  </div>
                  <div className="ov-stat-tile">
                    <div className="ov-stat-tile-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      </svg>
                    </div>
                    <span className="ov-stat-tile-count">{suites.length}</span>
                    <span className="ov-stat-tile-label">Suites</span>
                  </div>
                  <div className="ov-stat-tile">
                    <div className="ov-stat-tile-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <span className="ov-stat-tile-count">{runs.length}</span>
                    <span className="ov-stat-tile-label">Test Runs</span>
                  </div>
                  <div className="ov-stat-tile">
                    <div className="ov-stat-tile-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                      </svg>
                    </div>
                    <span className="ov-stat-tile-count">{totalSections}</span>
                    <span className="ov-stat-tile-label">Sections</span>
                  </div>
                </div>
              </div>

              {/* Suite Health Grid */}
              <div className="ov-suites ov-section-wrap">
                <div className="ov-health-header">
                  <h3 className="ov-section-title">
                    <span className="ov-section-title-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                      </svg>
                    </span>
                    Suite Health
                  </h3>
                  <div className="ov-date-nav">
                    <button
                      className="ov-date-nav-btn"
                      onClick={() => navigateDate('prev')}
                      disabled={!canGoPrev || healthLoading}
                      title="Previous day"
                      aria-label="Previous day"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <span className="ov-date-nav-label">
                      {new Date(healthDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {healthDate === todayStr && <span className="ov-date-today">Today</span>}
                    </span>
                    <button
                      className="ov-date-nav-btn"
                      onClick={() => navigateDate('next')}
                      disabled={!canGoNext || healthLoading}
                      title="Next day"
                      aria-label="Next day"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                </div>
                {healthLoading ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
                ) : suites.length > 0 && Object.keys(suiteStatsMap).length > 0 ? (
                  <div className="ov-suites-grid">
                    {suites.filter((s) => suiteStatsMap[s.id]?.total > 0).map((s) => {
                      const ss = suiteStatsMap[s.id] || { total: 0 };
                      const linkTo = ss.run_id ? `/runs/${ss.run_id}` : `/projects/${projectId}/suites/${s.id}`;
                      return (
                        <Link
                          key={s.id}
                          to={linkTo}
                          className="ov-suite-card"
                        >
                          <div className="ov-suite-card-header">
                            <span className="ov-suite-card-name">{s.name}</span>
                            <svg className="ov-suite-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </div>
                          <span className="ov-suite-card-meta">
                            {s.case_count || 0} cases &middot; {s.section_count || 0} sections
                          </span>
                          {ss.total > 0 && (
                            <div className="ov-suite-card-stats">
                              <div className="ov-suite-card-bar">
                                {STATUS_ORDER.map((st) =>
                                  ss[st] > 0 ? (
                                    <div
                                      key={st}
                                      style={{
                                        width: `${(ss[st] / ss.total) * 100}%`,
                                        backgroundColor: `var(--status-${st.toLowerCase()})`,
                                      }}
                                      title={`${st}: ${ss[st]}`}
                                    />
                                  ) : null
                                )}
                              </div>
                              <div className="ov-suite-card-counts">
                                {STATUS_ORDER.map((st) =>
                                  ss[st] > 0 ? (
                                    <span key={st} className="ov-suite-card-count" style={{ '--count-bg': `var(--status-${st.toLowerCase()}-bg)`, '--count-color': `var(--status-${st.toLowerCase()})` }}>
                                      <span className="ov-suite-card-count-dot" style={{ backgroundColor: `var(--status-${st.toLowerCase()})` }} />
                                      {ss[st]}
                                    </span>
                                  ) : null
                                )}
                                <span className="ov-suite-card-rate" style={{ color: ss.Passed / ss.total >= 0.8 ? 'var(--status-passed)' : ss.Passed / ss.total >= 0.5 ? 'var(--status-blocked)' : 'var(--status-failed)' }}>
                                  {Math.round(ss.Passed / ss.total * 100)}%
                                </span>
                              </div>
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-message">No test results for this date.</p>
                )}
              </div>

              {/* Sync Reports */}
              <div className="ov-sync ov-section-wrap">
                <h3 className="ov-section-title">
                  <span className="ov-section-title-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </span>
                  Sync Changes
                </h3>
                {syncLogs.length > 0 ? (
                  <div className="sync-log-list">
                    {syncLogs.map((log) => (
                      <SyncLogCard key={log.id} log={log} />
                    ))}
                  </div>
                ) : (
                  <p className="empty-message">No syncs recorded yet.</p>
                )}
              </div>
            </div>
          );
        })()}</div>)}
      </div>
    </div>
  );
}