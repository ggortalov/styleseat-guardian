import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import './DashboardPage.css';

const STATUS_ORDER = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];

function PassRate({ rate }) {
  const color = rate >= 80 ? 'var(--status-passed)' : rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)';
  return (
    <div className="run-card-v2-rate">
      <span className="run-card-v2-rate-number" style={{ color }}>{rate}%</span>
      <span className="run-card-v2-rate-label">pass rate</span>
    </div>
  );
}

export default function TestRunsPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runService.getAll()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <><Header breadcrumbs={[{ label: 'Test Runs' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <Header breadcrumbs={[{ label: 'Test Runs' }]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">Test Runs</h2>
            <p className="page-description">
              {runs.length} run{runs.length !== 1 ? 's' : ''} across all projects
            </p>
          </div>
        </div>

        {runs.length > 0 ? (
          <div className="run-list-v2">
            {runs.map((run) => {
              const total = run.stats?.total || 0;
              const passRate = run.stats?.pass_rate || 0;
              return (
                <div key={run.id} className="run-card-v2">
                  <div className="run-card-v2-icon">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                      <rect x="9" y="3" width="6" height="4" rx="1" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                  </div>

                  <div className="run-card-v2-body">
                    <Link to={`/runs/${run.id}`} className="run-card-v2-name">{run.name}</Link>
                    <div className="run-card-v2-meta">
                      Suite: {run.suite_name} &middot; {total} test{total !== 1 ? 's' : ''} &middot; {new Date(run.created_at).toLocaleDateString()}
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
            })}
          </div>
        ) : (
          <p className="empty-message">No test runs yet. Create a test run from a project's suite page.</p>
        )}
      </div>
    </div>
  );
}
