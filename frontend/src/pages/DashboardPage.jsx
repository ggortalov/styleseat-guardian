import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import dashboardService from '../services/dashboardService';
import projectService from '../services/projectService';
import suiteService from '../services/suiteService';
import './DashboardPage.css';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editSuite, setEditSuite] = useState(null);
  const [editName, setEditName] = useState('');
  const [deleteSuite, setDeleteSuite] = useState(null);
  const navigate = useNavigate();

  const fetchData = () => {
    setLoading(true);
    dashboardService.getGlobal()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const refresh = () => {
    fetchData();
    if (window.__refreshSidebarProjects) window.__refreshSidebarProjects();
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const project = await projectService.create({ name: newName, description: newDesc });
    const suite = await suiteService.create(project.id, { name: newName });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    refresh();
    navigate(`/projects/${project.id}/suites/${suite.id}`);
  };

  const handleEditSuite = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editSuite) return;
    // Update both the suite name and the project name
    if (editSuite.first_suite_id) {
      await suiteService.update(editSuite.first_suite_id, { name: editName });
    }
    await projectService.update(editSuite.id, { name: editName });
    setEditSuite(null);
    setEditName('');
    refresh();
  };

  const handleDeleteSuite = async () => {
    if (!deleteSuite) return;
    await projectService.delete(deleteSuite.id);
    setDeleteSuite(null);
    refresh();
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
          <h3 className="dashboard-section-title">
            Test Suites
            {data?.totals && (
              <span className="dashboard-section-count">
                {data.totals.cases} test case{data.totals.cases !== 1 ? 's' : ''} &middot; {data.totals.runs} test run{data.totals.runs !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
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
                    <Link to={p.first_suite_id ? `/projects/${p.id}/suites/${p.first_suite_id}` : `/projects/${p.id}`} className="project-card-name">{p.first_suite_name || p.name}</Link>
                    <div className="project-card-links">
                      <Link to={p.first_suite_id ? `/projects/${p.id}/suites/${p.first_suite_id}` : `/projects/${p.id}`}>Open</Link>
                      <span className="project-card-separator">|</span>
                      <button className="link-btn" onClick={() => { setEditSuite(p); setEditName(p.first_suite_name || p.name); }}>Edit</button>
                      <span className="project-card-separator">|</span>
                      <button className="link-btn danger" onClick={() => setDeleteSuite(p)}>Delete</button>
                    </div>
                    <div className="project-card-summary">
                      {p.case_count} test case{p.case_count !== 1 ? 's' : ''} &middot; {p.run_count} test run{p.run_count !== 1 ? 's' : ''}.
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
                  <Link to={p.first_suite_id ? `/projects/${p.id}/suites/${p.first_suite_id}` : `/projects/${p.id}`} className="project-card-chevron" title="Open suite">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-message">No test suites yet. Create your first test suite to get started.</p>
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

      <Modal isOpen={!!editSuite} onClose={() => setEditSuite(null)} title="Edit Test Suite">
        <form onSubmit={handleEditSuite} className="modal-form">
          <div className="form-group">
            <label>Suite Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter suite name"
              required
              autoFocus
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditSuite(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteSuite}
        onClose={() => setDeleteSuite(null)}
        onConfirm={handleDeleteSuite}
        title="Delete Suite"
        message={(() => {
          if (!deleteSuite) return '';
          const name = deleteSuite.first_suite_name || deleteSuite.name;
          const parts = [];
          if (deleteSuite.case_count > 0) parts.push(`${deleteSuite.case_count} test case${deleteSuite.case_count !== 1 ? 's' : ''}`);
          if (deleteSuite.run_count > 0) parts.push(`${deleteSuite.run_count} test run${deleteSuite.run_count !== 1 ? 's' : ''}`);
          return `"${name}"${parts.length ? ` (${parts.join(', ')})` : ''} will be permanently deleted.`;
        })()}
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Test Suite">
        <form onSubmit={handleCreateProject} className="modal-form">
          <div className="form-group">
            <label>Suite Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter suite name"
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
            <button type="submit" className="btn btn-primary">Create Suite</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
