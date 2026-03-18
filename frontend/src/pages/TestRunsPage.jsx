import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import './DashboardPage.css';

const STATUS_ORDER = ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];

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
          <span className="run-card-v2-name">{run.suite_name}</span>
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
          <Link to={`/runs/${run.id}`} className="run-card-v2-name">{run.suite_name}</Link>
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    runService.getAll()
      .then(setRuns)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openRuns = runs.filter(r => !r.is_locked);
  const completedRuns = runs.filter(r => r.is_locked);

  // Group completed runs by date
  const completedByDate = completedRuns.reduce((groups, run) => {
    const date = run.completed_at
      ? new Date(run.completed_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
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
          </div>
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
          </>
        ) : (
          <p className="empty-message">No test runs yet. Create a test run from a project's suite page.</p>
        )}
      </div>
    </div>
  );
}
