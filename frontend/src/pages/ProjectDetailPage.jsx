import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
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
      <div className="sync-log-header" onClick={() => log.new_case_names?.length > 0 && setExpanded(!expanded)}>
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
    } catch { /* ignore */ }
    setHealthLoading(false);
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

  useEffect(() => { fetchAll(); }, [projectId]);

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard' }]} /><LoadingSpinner /></>;

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

        <div className="tabs">
          <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={`tab ${tab === 'suites' ? 'active' : ''}`} onClick={() => setTab('suites')}>
            Test Suites ({suites.length})
          </button>
          <button className={`tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}>
            Test Runs ({runs.length})
          </button>
        </div>

        {tab === 'suites' && (() => {
          const activeRunsBySuite = {};
          runs.filter(r => !r.is_completed && r.suite_id).forEach(r => {
            activeRunsBySuite[r.suite_id] = (activeRunsBySuite[r.suite_id] || 0) + 1;
          });
          return (
            <div>
              {suites.length > 0 ? (
                <div className="suite-list">
                  {suites.map((s) => {
                    const activeCount = activeRunsBySuite[s.id] || 0;
                    return (
                      <div key={s.id} className="suite-card">
                        <div className="suite-card-icon">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </div>
                        <div className="suite-card-body">
                          <Link to={`/projects/${projectId}/suites/${s.id}`} className="suite-card-name">{s.name}</Link>
                          <div className="suite-card-summary">
                            Has {s.section_count || 0} section{(s.section_count || 0) !== 1 ? 's' : ''} with {s.case_count || 0} test case{(s.case_count || 0) !== 1 ? 's' : ''}.{' '}
                            {activeCount > 0
                              ? <strong>{activeCount} active test run{activeCount !== 1 ? 's' : ''}.</strong>
                              : 'No active test runs.'}
                          </div>
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
                <p className="empty-message">No test suites yet.</p>
              )}
            </div>
          );
        })()}

        {tab === 'runs' && (
          <div className="card">
            {runs.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Suite</th><th>Status</th><th>Pass Rate</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="clickable-row" onClick={() => navigate(`/runs/${r.id}`)}>
                      <td className="text-primary-bold">{r.name}</td>
                      <td>{r.suite_name}</td>
                      <td>{r.is_completed ? <StatusBadge status="Passed" size="sm" /> : <span className="badge-active">Active</span>}</td>
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
                      <td className="text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-message">No test runs yet.</p>
            )}
          </div>
        )}

        {tab === 'overview' && (() => {
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
                    <span className="ov-stat-tile-count">{totalCases}</span>
                    <span className="ov-stat-tile-label">Test Cases</span>
                  </div>
                  <div className="ov-stat-tile">
                    <span className="ov-stat-tile-count">{suites.length}</span>
                    <span className="ov-stat-tile-label">Suites</span>
                  </div>
                  <div className="ov-stat-tile">
                    <span className="ov-stat-tile-count">{runs.length}</span>
                    <span className="ov-stat-tile-label">Test Runs</span>
                  </div>
                  <div className="ov-stat-tile">
                    <span className="ov-stat-tile-count">{totalSections}</span>
                    <span className="ov-stat-tile-label">Sections</span>
                  </div>
                </div>
              </div>

              {/* Suite Health Grid */}
              <div className="ov-suites">
                <div className="ov-health-header">
                  <h3 className="ov-section-title">Suite Health</h3>
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
                                    <span key={st} className="ov-suite-card-count">
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

              {/* Sync Reports — only show syncs with new cases */}
              {(() => {
                const withNew = syncLogs.filter(l => l.new_cases > 0 || l.removed_cases > 0);
                return (
              <div className="ov-sync">
                <h3 className="ov-section-title">Sync Changes</h3>
                {withNew.length > 0 ? (
                  <div className="sync-log-list">
                    {withNew.map((log) => (
                      <SyncLogCard key={log.id} log={log} />
                    ))}
                  </div>
                ) : (
                  <p className="empty-message">No changes detected in recent syncs.</p>
                )}
              </div>
                );
              })()}
            </div>
          );
        })()}
      </div>
    </div>
  );
}