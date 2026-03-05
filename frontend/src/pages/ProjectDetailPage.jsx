import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/Header';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import projectService from '../services/projectService';
import suiteService from '../services/suiteService';
import runService from '../services/runService';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import './ProjectDetailPage.css';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [suites, setSuites] = useState([]);
  const [runs, setRuns] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('suites');

  // Suite modal
  const [showSuiteModal, setShowSuiteModal] = useState(false);
  const [editSuite, setEditSuite] = useState(null);
  const [suiteName, setSuiteName] = useState('');
  const [suiteDesc, setSuiteDesc] = useState('');

  // Run modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runName, setRunName] = useState('');
  const [runDesc, setRunDesc] = useState('');
  const [runSuiteId, setRunSuiteId] = useState('');

  // Edit project
  const [showEditProject, setShowEditProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false);
  const [deleteSuite, setDeleteSuite] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, r, st] = await Promise.all([
        projectService.getById(projectId),
        suiteService.getByProject(projectId),
        runService.getByProject(projectId),
        projectService.getStats(projectId),
      ]);
      setProject(p);
      setSuites(s);
      setRuns(r);
      setStats(st);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [projectId]);

  const handleSaveSuite = async (e) => {
    e.preventDefault();
    if (editSuite) {
      await suiteService.update(editSuite.id, { name: suiteName, description: suiteDesc });
    } else {
      await suiteService.create(projectId, { name: suiteName, description: suiteDesc });
    }
    setShowSuiteModal(false);
    setSuiteName('');
    setSuiteDesc('');
    setEditSuite(null);
    fetchAll();
  };

  const handleDeleteSuite = async () => {
    if (deleteSuite) {
      await suiteService.delete(deleteSuite.id);
      setDeleteSuite(null);
      fetchAll();
    }
  };

  const handleCreateRun = async (e) => {
    e.preventDefault();
    await runService.create(projectId, { name: runName, description: runDesc, suite_id: parseInt(runSuiteId) });
    setShowRunModal(false);
    setRunName('');
    setRunDesc('');
    setRunSuiteId('');
    fetchAll();
  };

  const handleEditProject = async (e) => {
    e.preventDefault();
    await projectService.update(projectId, { name: editName, description: editDesc });
    setShowEditProject(false);
    fetchAll();
    if (window.__refreshSidebarProjects) window.__refreshSidebarProjects();
  };

  const handleDeleteProject = async () => {
    await projectService.delete(projectId);
    if (window.__refreshSidebarProjects) window.__refreshSidebarProjects();
    navigate('/');
  };

  if (loading) return <><Header breadcrumbs={[{ label: 'Dashboard', path: '/' }, { label: 'Loading...' }]} /><LoadingSpinner /></>;

  const chartData = stats ? {
    labels: ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'],
    datasets: [{
      data: [stats.Passed, stats.Failed, stats.Blocked, stats.Retest, stats.Untested],
      backgroundColor: ['#4CAF50', '#F44336', '#FF9800', '#00897B', '#9E9E9E'],
      borderWidth: 0,
    }],
  } : null;

  const total = stats ? stats.Passed + stats.Failed + stats.Blocked + stats.Retest + stats.Untested : 0;

  return (
    <div>
      <Header breadcrumbs={[{ label: 'Dashboard', path: '/' }, { label: project?.name }]} />
      <div className="page-content">
        <div className="page-toolbar">
          <div>
            <h2 className="page-heading">{project?.name}</h2>
            {project?.description && <p className="page-description">{project.description}</p>}
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-secondary" onClick={() => {
              setEditName(project.name);
              setEditDesc(project.description || '');
              setShowEditProject(true);
            }}>Edit</button>
            <button className="btn btn-danger" onClick={() => setShowDelete(true)}>Delete</button>
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
          runs.filter(r => !r.is_completed).forEach(r => {
            activeRunsBySuite[r.suite_id] = (activeRunsBySuite[r.suite_id] || 0) + 1;
          });
          return (
            <div>
              <div className="card-toolbar">
                <button className="btn btn-primary" onClick={() => {
                  setEditSuite(null);
                  setSuiteName('');
                  setSuiteDesc('');
                  setShowSuiteModal(true);
                }}>+ New Suite</button>
              </div>
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
                          <div className="suite-card-links">
                            <a href="#" onClick={(e) => {
                              e.preventDefault();
                              setRunName('');
                              setRunDesc('');
                              setRunSuiteId(String(s.id));
                              setShowRunModal(true);
                            }}>Run Test</a>
                            <span className="suite-card-separator">|</span>
                            <a href="#" onClick={(e) => {
                              e.preventDefault();
                              setTab('runs');
                            }}>Test Runs</a>
                            <span className="suite-card-separator">|</span>
                            <a href="#" onClick={(e) => {
                              e.preventDefault();
                              setEditSuite(s);
                              setSuiteName(s.name);
                              setSuiteDesc(s.description || '');
                              setShowSuiteModal(true);
                            }}>Edit</a>
                          </div>
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
                <p className="empty-message">No test suites yet. Create one to organize your test cases.</p>
              )}
            </div>
          );
        })()}

        {tab === 'runs' && (
          <div className="card">
            <div className="card-toolbar">
              <button className="btn btn-primary" onClick={() => {
                setRunName('');
                setRunDesc('');
                setRunSuiteId(suites.length > 0 ? String(suites[0].id) : '');
                setShowRunModal(true);
              }} disabled={suites.length === 0}>+ New Run</button>
            </div>
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
              <p className="empty-message">No test runs yet. Create a suite with test cases first, then start a run.</p>
            )}
          </div>
        )}

        {tab === 'overview' && (
          <div className="overview-grid">
            <div className="card">
              <h3>Test Results Distribution</h3>
              {total > 0 ? (
                <div className="chart-container" style={{ maxWidth: 240, margin: '0 auto' }}>
                  <Doughnut data={chartData} options={{ plugins: { legend: { position: 'bottom' } }, cutout: '60%' }} />
                </div>
              ) : (
                <p className="empty-message">No test results yet</p>
              )}
            </div>
            <div className="card">
              <h3>Summary</h3>
              <div className="summary-list">
                <div className="summary-row"><span>Suites</span><span>{suites.length}</span></div>
                <div className="summary-row"><span>Test Cases</span><span>{project?.case_count || 0}</span></div>
                <div className="summary-row"><span>Test Runs</span><span>{runs.length}</span></div>
                <div className="summary-row"><span>Passed</span><span style={{ color: 'var(--status-passed)' }}>{stats?.Passed || 0}</span></div>
                <div className="summary-row"><span>Failed</span><span style={{ color: 'var(--status-failed)' }}>{stats?.Failed || 0}</span></div>
                <div className="summary-row"><span>Blocked</span><span style={{ color: 'var(--status-blocked)' }}>{stats?.Blocked || 0}</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suite Modal */}
      <Modal isOpen={showSuiteModal} onClose={() => setShowSuiteModal(false)} title={editSuite ? 'Edit Suite' : 'Create Suite'}>
        <form onSubmit={handleSaveSuite} className="modal-form">
          <div className="form-group">
            <label>Suite Name</label>
            <input type="text" value={suiteName} onChange={(e) => setSuiteName(e.target.value)} required autoFocus placeholder="Enter suite name" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={suiteDesc} onChange={(e) => setSuiteDesc(e.target.value)} rows={3} placeholder="Optional description" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowSuiteModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editSuite ? 'Save' : 'Create'}</button>
          </div>
        </form>
      </Modal>

      {/* Run Modal */}
      <Modal isOpen={showRunModal} onClose={() => setShowRunModal(false)} title="Create Test Run">
        <form onSubmit={handleCreateRun} className="modal-form">
          <div className="form-group">
            <label>Run Name</label>
            <input type="text" value={runName} onChange={(e) => setRunName(e.target.value)} required autoFocus placeholder="e.g. Sprint 1 Regression" />
          </div>
          <div className="form-group">
            <label>Suite</label>
            <select value={runSuiteId} onChange={(e) => setRunSuiteId(e.target.value)} required>
              {suites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.case_count} cases)</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={runDesc} onChange={(e) => setRunDesc(e.target.value)} rows={3} placeholder="Optional description" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowRunModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Run</button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal isOpen={showEditProject} onClose={() => setShowEditProject(false)} title="Edit Project">
        <form onSubmit={handleEditProject} className="modal-form">
          <div className="form-group">
            <label>Project Name</label>
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowEditProject(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      {/* Delete project */}
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        message={`Are you sure you want to delete "${project?.name}"? This will delete all suites, test cases, and test runs.`}
      />

      {/* Delete suite */}
      <ConfirmDialog
        isOpen={!!deleteSuite}
        onClose={() => setDeleteSuite(null)}
        onConfirm={handleDeleteSuite}
        title="Delete Suite"
        message={`Are you sure you want to delete "${deleteSuite?.name}"? All sections and test cases in this suite will be deleted.`}
      />
    </div>
  );
}
