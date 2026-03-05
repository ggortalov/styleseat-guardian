import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import dashboardService from '../services/dashboardService';
import projectService from '../services/projectService';
import './DashboardPage.css';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    dashboardService.getGlobal()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await projectService.create({ name: newName, description: newDesc });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    fetchData();
    if (window.__refreshSidebarProjects) window.__refreshSidebarProjects();
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <div className="page-content">
        <div className="page-toolbar">
          <h2 className="page-heading">Dashboard</h2>
          <button className="btn btn-brand" onClick={() => setShowCreate(true)}>+ Add New Suite</button>
        </div>

        <div className="dashboard-section">
          <h3 className="dashboard-section-title">Test Suites</h3>
          {data?.projects?.length > 0 ? (
            <div className="project-list">
              {data.projects.map((p) => (
                <div key={p.id} className="project-card">
                  <div className="project-card-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#4CAF50" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="project-card-body">
                    <Link to={`/projects/${p.id}`} className="project-card-name">{p.name}</Link>
                    <div className="project-card-links">
                      <Link to={`/projects/${p.id}`}>Open</Link>
                      <span className="project-card-separator">|</span>
                      <Link to={`/projects/${p.id}`}>Suites</Link>
                      <span className="project-card-separator">|</span>
                      <Link to={`/projects/${p.id}`}>Runs</Link>
                    </div>
                    <div className="project-card-summary">
                      {p.suite_count} suite{p.suite_count !== 1 ? 's' : ''} &middot; {p.case_count} test case{p.case_count !== 1 ? 's' : ''} &middot; {p.run_count} test run{p.run_count !== 1 ? 's' : ''}.
                    </div>
                    {p.stats.total > 0 && (
                      <div className="project-card-bar">
                        {['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'].map((s) => (
                          p.stats[s] > 0 && (
                            <div
                              key={s}
                              className="bar-segment"
                              style={{
                                width: `${(p.stats[s] / p.stats.total) * 100}%`,
                                backgroundColor: `var(--status-${s.toLowerCase()})`,
                              }}
                              title={`${s}: ${p.stats[s]}`}
                            />
                          )
                        ))}
                      </div>
                    )}
                  </div>
                  <Link to={`/projects/${p.id}`} className="project-card-chevron" title="Open project">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No projects yet. Create your first project to get started.</p>
          )}
        </div>

        {data?.recent_runs?.length > 0 && (
          <div className="dashboard-section">
            <h3 className="dashboard-section-title">Recent Test Runs</h3>
            <div className="run-list">
              {data.recent_runs.map((run) => (
                <div key={run.id} className="run-card">
                  <div className="run-card-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1a3a2a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <div className="run-card-body">
                    <Link to={`/runs/${run.id}`} className="run-card-name">{run.name}</Link>
                    <div className="run-card-summary">
                      Project: {run.project_name} &middot; Suite: {run.suite_name} &middot; {run.total_results} test{run.total_results !== 1 ? 's' : ''} &middot;{' '}
                      <strong style={{ color: run.pass_rate >= 80 ? 'var(--status-passed)' : run.pass_rate >= 50 ? 'var(--status-blocked)' : 'var(--status-failed)' }}>
                        {run.pass_rate}%
                      </strong>
                    </div>
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
          </div>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Project">
        <form onSubmit={handleCreateProject} className="modal-form">
          <div className="form-group">
            <label>Project Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Project</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
