import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import projectService from '../services/projectService';
import runService from '../services/runService';
import authService from '../services/authService';
import Modal from './Modal';
import {
  SOUND_OPTIONS, SOUND_CATEGORIES, ERROR_SOUND_OPTIONS,
  getSoundEnabled, setSoundEnabled,
  getSoundChoice, setSoundChoice,
  getSoundVolume, setSoundVolume,
  getErrorSoundChoice, setErrorSoundChoice,
  previewSound, previewErrorSound,
} from '../services/soundService';
import './Sidebar.css';

function getIdsFromPath(pathname) {
  const projectMatch = pathname.match(/\/projects\/(\d+)/);
  const suiteMatch = pathname.match(/\/suites\/(\d+)/);
  const runMatch = pathname.match(/\/runs\/(\d+)/);
  return {
    projectId: projectMatch ? parseInt(projectMatch[1]) : null,
    suiteId: suiteMatch ? parseInt(suiteMatch[1]) : null,
    runId: runMatch ? parseInt(runMatch[1]) : null,
  };
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, isMobile, width, onResizeStart, isResizing }) {
  const { user, logout, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: pathProjectId, suiteId: pathSuiteId, runId: pathRunId } = getIdsFromPath(location.pathname);
  const [projects, setProjects] = useState([]);
  const [runs, setRuns] = useState([]);
  const [suitesOpen, setSuitesOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);
  const errorTimerRef = useRef(null);

  const API_BASE = 'http://localhost:5001';

  const allSuites = projects.flatMap((p) =>
    (p.suites || []).map((s) => ({ ...s, project_id: p.id }))
  );

  const loadProjects = () => {
    projectService.getAll()
      .then(setProjects)
      .catch(() => {});
  };

  const loadRuns = () => {
    runService.getAll({ limit: 10 })
      .then((data) => {
        const items = data.items || [];
        setRuns(
          items
            .filter(r => !r.is_locked)
            .sort((a, b) => {
              const da = a.run_date ? new Date(a.run_date + 'T12:00:00') : new Date(a.created_at);
              const db = b.run_date ? new Date(b.run_date + 'T12:00:00') : new Date(b.created_at);
              return db - da;
            })
        );
      })
      .catch(() => {});
  };

  useEffect(() => { loadProjects(); loadRuns(); }, []);

  useEffect(() => {
    window.__refreshSidebarProjects = loadProjects;
    window.__refreshSidebarRuns = loadRuns;
    return () => { delete window.__refreshSidebarProjects; delete window.__refreshSidebarRuns; };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, _setSoundEnabled] = useState(getSoundEnabled);
  const [soundChoice, _setSoundChoice] = useState(getSoundChoice);
  const [errorSoundChoice, _setErrorSoundChoice] = useState(getErrorSoundChoice);
  const [soundVolume, _setSoundVolume] = useState(getSoundVolume);

  // Re-read per-user preferences when the user changes
  useEffect(() => {
    _setSoundEnabled(getSoundEnabled());
    _setSoundChoice(getSoundChoice());
    _setErrorSoundChoice(getErrorSoundChoice());
    _setSoundVolume(getSoundVolume());
  }, [user?.id]);

  const handleSoundToggle = () => {
    const next = !soundEnabled;
    _setSoundEnabled(next);
    setSoundEnabled(next);
  };
  const handleSoundChoice = (name) => { _setSoundChoice(name); setSoundChoice(name); previewSound(name); };
  const handleErrorSoundChoice = (name) => { _setErrorSoundChoice(name); setErrorSoundChoice(name); previewErrorSound(name); };
  const handleSoundVolume = (e) => { const v = parseInt(e.target.value, 10); _setSoundVolume(v); setSoundVolume(v); };

  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const logoutTimerRef = useRef(null);

  const handleLogoutClick = () => {
    if (logoutConfirm) {
      clearTimeout(logoutTimerRef.current);
      setLogoutConfirm(false);
      logout();
      navigate('/login');
    } else {
      setLogoutConfirm(true);
      logoutTimerRef.current = setTimeout(() => setLogoutConfirm(false), 3000);
    }
  };

  useEffect(() => {
    return () => clearTimeout(logoutTimerRef.current);
  }, []);

  const handleAvatarClick = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const showUploadError = (msg) => {
    clearTimeout(errorTimerRef.current);
    setUploadError(msg);
    errorTimerRef.current = setTimeout(() => setUploadError(''), 4000);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError('');
    if (file.size > 5 * 1024 * 1024) {
      showUploadError('File too large (max 5 MB)');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const data = await authService.uploadAvatar(file);
      updateAvatar(data.avatar);
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed. Please try again.';
      showUploadError(msg);
    } finally {
      setUploading(false);
    }
    e.target.value = '';
  };

  return (
    <>
    <aside
      className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${isMobile ? 'sidebar--mobile' : ''} ${isMobile && mobileOpen ? 'sidebar--mobile-open' : ''}`}
      style={!collapsed && !isMobile && width ? { width, transition: isResizing ? 'none' : undefined } : undefined}
      onClickCapture={collapsed && !isMobile ? (e) => { if (e.target.closest('a[href]')) return; e.stopPropagation(); e.preventDefault(); onToggleCollapse(); } : undefined}
    >
      {!collapsed && !isMobile && (
        <div className="sidebar-resize-handle" onMouseDown={onResizeStart} />
      )}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/favicon.jpg" alt="StyleSeat Guardian" className="sidebar-logo-img" onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} />
          {!collapsed && (
            <div className="sidebar-logo-wordmark">
              <span className="sidebar-logo-name">StyleSeat <span className="sidebar-logo-accent">Guardian</span></span>
            </div>
          )}
        </div>
        {isMobile && !collapsed && (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Close menu" aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to={projects.length > 0 ? `/projects/${projects[0].id}` : '/'}
          className={`sidebar-link ${location.pathname.match(/^\/projects\/\d+$/) && !location.search.includes('tab=suites') ? 'active' : ''}`}
          title="Overview"
        >
          <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="sidebar-label">Overview</span>
        </NavLink>

        {collapsed && (
          <NavLink to={projects.length > 0 ? `/projects/${projects[0].id}?tab=suites` : '/suites'} className={({ isActive }) => `sidebar-link ${isActive || location.pathname.includes('/suites') || location.pathname.includes('/cases') ? 'active' : ''}`} title="Test Suites">
            <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <line x1="9" y1="10" x2="15" y2="10" />
              <line x1="9" y1="14" x2="15" y2="14" />
              <line x1="9" y1="18" x2="12" y2="18" />
            </svg>
            <span className="sidebar-label">Test Suites</span>
          </NavLink>
        )}

        {collapsed && (
          <NavLink to="/runs" className={({ isActive }) => `sidebar-link ${isActive || location.pathname.includes('/runs') || location.pathname.includes('/execute') ? 'active' : ''}`} title="Test Runs">
            <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
            <span className="sidebar-label">Test Runs</span>
          </NavLink>
        )}

        <div className="sidebar-section">
          <button className="sidebar-section-toggle" onClick={() => { navigate(projects.length > 0 ? `/projects/${projects[0].id}?tab=suites` : '/suites'); if (collapsed) return; setSuitesOpen(!suitesOpen); }} title="Test Suites" aria-expanded={suitesOpen && !collapsed}>
            <svg className={`sidebar-icon sidebar-chevron ${suitesOpen && !collapsed ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="sidebar-label">Test Suites</span>
          </button>
          {suitesOpen && !collapsed && (
            <div className="sidebar-submenu">
              {allSuites.map((s) => {
                const suitePath = `/projects/${s.project_id}/suites/${s.id}`;
                const isSuiteActive = pathSuiteId === s.id;
                return (
                  <NavLink
                    key={s.id}
                    to={suitePath}
                    className={`sidebar-suite-item ${isSuiteActive ? 'active' : ''}`}
                  >
                    <svg className="sidebar-suite-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                    <span className="sidebar-suite-item-name">{s.name}</span>
                    <span className="sidebar-suite-item-count">{s.case_count}</span>
                  </NavLink>
                );
              })}
              {allSuites.length === 0 && (
                <span className="sidebar-empty">No suites yet</span>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <button className="sidebar-section-toggle" onClick={() => { navigate('/runs'); if (collapsed) return; setRunsOpen(!runsOpen); }} title="Test Runs" aria-expanded={runsOpen && !collapsed}>
            <svg className={`sidebar-icon sidebar-chevron ${runsOpen && !collapsed ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="sidebar-label">Test Runs</span>
          </button>
          {runsOpen && !collapsed && (
            <div className="sidebar-submenu">
              {runs.map((r) => (
                <NavLink
                  key={r.id}
                  to={`/runs/${r.id}`}
                  className={`sidebar-run-item ${pathRunId === r.id ? 'active' : ''}`}
                >
                  <svg className="sidebar-suite-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                  <span className="sidebar-run-name">{(r.name?.includes(' \u00b7 ') ? r.name.split(' \u00b7 ')[0] : r.name?.replace(/ - Manual Run .*$/, '')) || r.suite_name || r.name}</span>
                  <span className="sidebar-suite-item-count">{r.stats?.total || 0}</span>
                </NavLink>
              ))}
              {runs.length === 0 && (
                <span className="sidebar-empty">No runs yet</span>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />
        <div
          className={`sidebar-user ${!collapsed ? 'sidebar-user--clickable' : ''}`}
          onClick={!collapsed ? (e) => { e.stopPropagation(); setSettingsOpen(true); } : undefined}
          title={!collapsed ? 'Open settings' : undefined}
        >
          <div
            className={`sidebar-avatar ${uploading ? 'sidebar-avatar--uploading' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleAvatarClick(e); }}
            title="Change profile photo"
          >
            {user?.avatar ? (
              <img src={`${API_BASE}${user.avatar}`} alt="Avatar" />
            ) : (
              <span className="sidebar-avatar-initials">
                {user?.username?.slice(0, 2).toUpperCase() || 'SG'}
              </span>
            )}
            <div className="sidebar-avatar-overlay">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            {uploading && <div className="sidebar-avatar-spinner" />}
          </div>
          {uploadError && (
            <div className="sidebar-upload-error" onClick={() => setUploadError('')}>
              {uploadError}
            </div>
          )}
          {!collapsed && (
            <>
              <span className="sidebar-username">{user?.username}</span>
              <svg className="sidebar-user-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </>
          )}
        </div>
        {collapsed ? (
          <>
            <button className="sidebar-settings-icon" onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }} title="Settings" aria-label="Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button className={`sidebar-logout-icon ${logoutConfirm ? 'sidebar-logout--confirm' : ''}`} onClick={(e) => { e.stopPropagation(); handleLogoutClick(); }} title={logoutConfirm ? 'Click again to confirm' : 'Logout'} aria-label="Logout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </>
        ) : (
          <button className={`sidebar-logout ${logoutConfirm ? 'sidebar-logout--confirm' : ''}`} onClick={handleLogoutClick}>
            <svg className="sidebar-logout-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {logoutConfirm ? 'Confirm?' : 'Logout'}
          </button>
        )}
      </div>

    </aside>

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <div className="settings-modal-section">
          <div className="settings-modal-row">
            <span className="settings-modal-label">Sounds</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!soundEnabled && (
                <span className="settings-modal-aaron">Aaron mode</span>
              )}
              <button
                className="settings-flyout-toggle"
                onClick={handleSoundToggle}
                data-enabled={soundEnabled}
              >
                <span className="settings-flyout-toggle-knob" />
              </button>
            </div>
          </div>

          {soundEnabled && (
            <div className="settings-modal-body">
              <label className="settings-flyout-volume">
                <span>Volume</span>
                <input type="range" min="0" max="100" value={soundVolume} onChange={handleSoundVolume} />
                <span className="settings-flyout-volume-val">{soundVolume}%</span>
              </label>

              <div className="settings-flyout-section">
                <div className="settings-flyout-label">Success sound</div>
                {SOUND_CATEGORIES.map((cat) => (
                  <div key={cat} className="settings-flyout-group">
                    <div className="settings-flyout-cat">{cat}</div>
                    <div className="settings-flyout-pills">
                      {SOUND_OPTIONS.filter((s) => s.category === cat).map((s) => (
                        <button key={s.name} className={`settings-flyout-pill ${soundChoice === s.name ? 'active' : ''}`} onClick={() => handleSoundChoice(s.name)} title={s.description}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="settings-flyout-section">
                <div className="settings-flyout-label">Error sound</div>
                <div className="settings-flyout-pills">
                  {ERROR_SOUND_OPTIONS.map((s) => (
                    <button key={s.name} className={`settings-flyout-pill ${errorSoundChoice === s.name ? 'active' : ''}`} onClick={() => handleErrorSoundChoice(s.name)} title={s.description}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
