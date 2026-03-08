import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import './DashboardPage.css';

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
          <h2 className="page-heading">Test Runs</h2>
        </div>

        <div className="dashboard-section">
          <h3 className="dashboard-section-title">
            All Test Runs
            <span className="dashboard-section-count">
              {runs.length} run{runs.length !== 1 ? 's' : ''}
            </span>
          </h3>
          {runs.length > 0 ? (
            <div className="run-list">
              {runs.map((run) => (
                <div key={run.id} className="run-card">
                  <div className="run-card-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <div className="run-card-body">
                    <Link to={`/runs/${run.id}`} className="run-card-name">{run.name}</Link>
                    <div className="run-card-summary">
                      Project: {run.project_name} &middot; Suite: {run.suite_name} &middot; {run.stats?.total || 0} test{run.stats?.total !== 1 ? 's' : ''} &middot;{' '}
                      <strong style={{ color: run.stats?.pass_rate >= 80 ? 'var(--status-passed)' : run.stats?.pass_rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)' }}>
                        {run.stats?.pass_rate || 0}%
                      </strong>
                    </div>
                    {run.stats?.total > 0 && (
                      <div className="project-card-bar" style={{ marginTop: '6px' }}>
                        {['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'].map((s) => (
                          run.stats[s] > 0 && (
                            <div
                              key={s}
                              className="bar-segment"
                              style={{
                                width: `${(run.stats[s] / run.stats.total) * 100}%`,
                                backgroundColor: `var(--status-${s.toLowerCase()})`,
                              }}
                              title={`${s}: ${run.stats[s]}`}
                            />
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="run-card-date">
                    {new Date(run.created_at).toLocaleDateString()}
                  </div>
                  <Link to={`/runs/${run.id}`} className="run-card-chevron" title="Open run">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No test runs yet. Create a test run from a project's suite page.</p>
          )}
        </div>
      </div>
    </div>
  );
}
