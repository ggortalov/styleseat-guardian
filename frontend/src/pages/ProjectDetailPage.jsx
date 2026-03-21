import { useState, useEffect } from 'react';
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
  const tab = searchParams.get('tab') || 'suites';
  const setTab = (t) => setSearchParams(t === 'suites' ? {} : { tab: t }, { replace: true });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, r, dash, logs] = await Promise.all([
        projectService.getById(projectId),
        suiteService.getByProject(projectId),
        runService.getByProject(projectId),
        dashboardService.getByProject(projectId),
        dashboardService.getSyncLogs({ project_id: projectId, limit: 10 }),
      ]);
      setProject(p);
      setSuites(s);
      setRuns(r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setDashboardData(dash);
      setSyncLogs(logs);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

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
          <button className={`tab ${tab === 'suites' ? 'active' : ''}`} onClick={() => setTab('suites')}>
            Test Suites ({suites.length})
          </button>
          <button className={`tab ${tab === 'runs' ? 'active' : ''}`} onClick={() => setTab('runs')}>
            Test Runs ({runs.length})
          </button>
          <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
            Overview
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

          // Build suite stats from dashboard runs for mini-bars
          const dashRuns = dashboardData?.runs || [];
          const suiteStatsMap = {};
          dashRuns.forEach((r) => {
            const sid = r.suite_id;
            if (!suiteStatsMap[sid]) {
              suiteStatsMap[sid] = { Passed: 0, Failed: 0, Blocked: 0, Retest: 0, Untested: 0, total: 0 };
            }
            STATUS_ORDER.forEach((s) => {
              suiteStatsMap[sid][s] += (r.stats?.[s] || 0);
            });
            suiteStatsMap[sid].total += (r.stats?.total || 0);
          });

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
                <h3 className="ov-section-title">Suite Health</h3>
                {suites.length > 0 ? (
                  <div className="ov-suites-grid">
                    {suites.map((s) => {
                      const ss = suiteStatsMap[s.id] || { total: 0 };
                      return (
                        <Link
                          key={s.id}
                          to={`/projects/${projectId}/suites/${s.id}`}
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
                          )}
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-message">No suites yet</p>
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