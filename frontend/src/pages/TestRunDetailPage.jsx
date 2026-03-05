import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import runService from '../services/runService';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import './TestRunDetailPage.css';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function TestRunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  const fetchData = async () => {
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
  };

  useEffect(() => { fetchData(); }, [runId]);

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }]} /><LoadingSpinner /></>;

  const stats = run?.stats || {};
  const chartData = {
    labels: ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'],
    datasets: [{
      data: [stats.Passed, stats.Failed, stats.Blocked, stats.Retest, stats.Untested],
      backgroundColor: ['#4CAF50', '#F44336', '#FF9800', '#00897B', '#9E9E9E'],
      borderWidth: 0,
    }],
  };

  const statuses = ['All', 'Passed', 'Failed', 'Blocked', 'Retest', 'Untested'];
  const filtered = filter === 'All' ? results : results.filter((r) => r.status === filter);

  return (
    <div>
      <Header breadcrumbs={[
        { label: 'Dashboard', path: '/' },
        { label: run?.name },
      ]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">{run?.name}</h2>
            <p className="page-description">Suite: {run?.suite_name} &middot; {run?.is_completed ? 'Completed' : 'Active'}</p>
          </div>
          <button className="btn btn-secondary" onClick={() => navigate(`/projects/${run.project_id}`)}>Back to Project</button>
        </div>

        <div className="run-summary">
          <div className="run-summary-bar">
            {['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'].map((s) => (
              stats[s] > 0 && (
                <div
                  key={s}
                  className="summary-bar-segment"
                  style={{
                    width: `${(stats[s] / stats.total) * 100}%`,
                    backgroundColor: `var(--status-${s.toLowerCase()})`,
                  }}
                >
                  <span className="segment-label">{stats[s]}</span>
                </div>
              )
            ))}
          </div>
          <div className="run-summary-stats">
            {['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'].map((s) => (
              <div key={s} className="run-stat-item">
                <span className="run-stat-color" style={{ backgroundColor: `var(--status-${s.toLowerCase()})` }} />
                <span>{s}: {stats[s] || 0}</span>
              </div>
            ))}
            <div className="run-stat-item" style={{ fontWeight: 700 }}>
              Total: {stats.total || 0} &middot; Pass Rate: {stats.pass_rate || 0}%
            </div>
          </div>
        </div>

        <div className="run-detail-grid">
          <div className="run-chart-card card">
            <h3>Results Distribution</h3>
            <div className="chart-container" style={{ maxWidth: 200, margin: '0 auto' }}>
              <Doughnut data={chartData} options={{ plugins: { legend: { display: false } }, cutout: '65%' }} />
            </div>
          </div>

          <div className="run-results-card card">
            <div className="results-toolbar">
              <h3>Test Results</h3>
              <div className="status-filters">
                {statuses.map((s) => (
                  <button
                    key={s}
                    className={`filter-btn ${filter === s ? 'active' : ''}`}
                    onClick={() => setFilter(s)}
                  >
                    {s} {s !== 'All' ? `(${stats[s] || 0})` : `(${stats.total || 0})`}
                  </button>
                ))}
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Title</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th>Defect</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="text-muted">C{r.case_id}</td>
                    <td className="text-primary-bold">{r.case_title}</td>
                    <td className="text-muted">{r.section_name}</td>
                    <td><StatusBadge status={r.status} size="sm" /></td>
                    <td className="text-muted">{r.defect_id || '-'}</td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => navigate(`/runs/${runId}/execute/${r.id}`)}>
                        Execute
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
