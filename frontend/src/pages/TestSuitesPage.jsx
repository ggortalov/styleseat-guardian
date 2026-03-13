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

export default function TestSuitesPage() {
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

  const handleCreateSuite = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const projects = await projectService.getAll();
    let project = projects[0];
    if (!project) {
      project = await projectService.create({ name: 'Default', description: '' });
    }
    const suite = await suiteService.create(project.id, { name: newName, description: newDesc });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    refresh();
    navigate(`/projects/${project.id}/suites/${suite.id}`);
  };

  const handleEditSuite = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editSuite) return;
    await suiteService.update(editSuite.id, { name: editName });
    setEditSuite(null);
    setEditName('');
    refresh();
  };

  const handleDeleteSuite = async () => {
    if (!deleteSuite) return;
    await suiteService.delete(deleteSuite.id);
    setDeleteSuite(null);
    refresh();
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Test Suites' }]} /><LoadingSpinner /></>;

  return (
    <div>
      <div className="page-content">
        <div className="page-toolbar">
          <h2 className="page-heading">Test Suites</h2>
          <button className="btn btn-brand" onClick={() => setShowCreate(true)}>+ Add New Suite</button>
        </div>

        <div className="dashboard-section">
          {data?.totals && (
            <div className="dashboard-section-count" style={{ marginBottom: 16 }}>
              {data.totals.suites} suite{data.totals.suites !== 1 ? 's' : ''} &middot; {data.totals.cases} test case{data.totals.cases !== 1 ? 's' : ''}
            </div>
          )}
          {data?.suites?.length > 0 ? (
            <div className="project-list">
              {data.suites.map((s) => {
                const suiteLink = `/projects/${s.project_id}/suites/${s.id}`;
                return (
                <div key={s.id} className="project-card">
                  <div className="project-card-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                  </div>
                  <div className="project-card-body">
                    <Link to={suiteLink} className="project-card-name">{s.name}</Link>
                    <div className="project-card-links">
                      <Link to={suiteLink}>Open</Link>
                      <span className="project-card-separator">|</span>
                      <button className="link-btn" onClick={() => { setEditSuite(s); setEditName(s.name); }}>Edit</button>
                      <span className="project-card-separator">|</span>
                      <button className="link-btn danger" onClick={() => setDeleteSuite(s)}>Delete</button>
                    </div>
                    <div className="project-card-summary">
                      {s.case_count} test case{s.case_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <Link to={suiteLink} className="project-card-chevron" title="Open suite">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-message">No test suites yet. Create your first test suite to get started.</p>
          )}
        </div>
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
          const parts = [];
          if (deleteSuite.case_count > 0) parts.push(`${deleteSuite.case_count} test case${deleteSuite.case_count !== 1 ? 's' : ''}`);
          if (deleteSuite.run_count > 0) parts.push(`${deleteSuite.run_count} test run${deleteSuite.run_count !== 1 ? 's' : ''}`);
          return `"${deleteSuite.name}"${parts.length ? ` (${parts.join(', ')})` : ''} will be permanently deleted.`;
        })()}
        requireSafeguard
      />

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Test Suite">
        <form onSubmit={handleCreateSuite} className="modal-form">
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
