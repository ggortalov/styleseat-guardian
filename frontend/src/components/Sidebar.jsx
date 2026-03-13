import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import projectService from '../services/projectService';
import runService from '../services/runService';
import UserSettingsModal from './UserSettingsModal';
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

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, isMobile }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: pathProjectId, suiteId: pathSuiteId, runId: pathRunId } = getIdsFromPath(location.pathname);
  const [projects, setProjects] = useState([]);
  const [runs, setRuns] = useState([]);
  const [suitesOpen, setSuitesOpen] = useState(true);
  const [runsOpen, setRunsOpen] = useState(true);

  const API_BASE = 'http://localhost:5001';

  // Flatten all suites from all projects into a single list
  const allSuites = projects.flatMap((p) =>
    (p.suites || []).map((s) => ({ ...s, project_id: p.id }))
  );

  const loadProjects = () => {
    projectService.getAll()
      .then(setProjects)
      .catch(() => {});
  };

  const loadRuns = () => {
    runService.getAll()
      .then(setRuns)
      .catch(() => {});
  };

  useEffect(() => { loadProjects(); loadRuns(); }, []);

  // Expose refresh to window for cross-component updates
  useEffect(() => {
    window.__refreshSidebarProjects = loadProjects;
    window.__refreshSidebarRuns = loadRuns;
    return () => { delete window.__refreshSidebarProjects; delete window.__refreshSidebarRuns; };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const logoutTimerRef = useRef(null);

  const handleLogoutClick = () => {
    if (logoutConfirm) {
      // Second click — actually logout
      clearTimeout(logoutTimerRef.current);
      setLogoutConfirm(false);
      logout();
      navigate('/login');
    } else {
      // First click — show confirm state
      setLogoutConfirm(true);
      logoutTimerRef.current = setTimeout(() => setLogoutConfirm(false), 3000);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimeout(logoutTimerRef.current);
  }, []);

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${isMobile ? 'sidebar--mobile' : ''} ${isMobile && mobileOpen ? 'sidebar--mobile-open' : ''}`}
      onClickCapture={collapsed && !isMobile ? (e) => { if (e.target.closest('a[href]')) return; e.stopPropagation(); e.preventDefault(); onToggleCollapse(); } : undefined}
    >
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/favicon.jpg" alt="StyleSeat Guardian" className="sidebar-logo-img" />
          {!collapsed && (
            <div className="sidebar-logo-wordmark">
              <span className="sidebar-logo-name">StyleSeat <span className="sidebar-logo-accent">Regression Guard</span></span>
            </div>
          )}
        </div>
        {!collapsed && (
          isMobile ? (
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Close menu" aria-label="Close menu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )
        )}
      </div>

      <nav className="sidebar-nav">
        {collapsed && (
          <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive || location.pathname.includes('/suites') || location.pathname.includes('/cases') ? 'active' : ''}`} title="Test Suites">
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
          <button className="sidebar-section-toggle" onClick={() => { navigate('/'); if (collapsed) return; setSuitesOpen(!suitesOpen); }} title="Test Suites" aria-expanded={suitesOpen && !collapsed}>
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
                  className={`sidebar-suite-item ${pathRunId === r.id ? 'active' : ''}`}
                >
                  <svg className="sidebar-suite-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                  <span className="sidebar-suite-item-name">
                    {r.suite_name || r.name}
                    {r.created_at && <span className="sidebar-run-date">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </span>
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
        <div className="sidebar-user sidebar-user--clickable" onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }} title="User Settings">
          {user?.avatar ? (
            <img
              src={`${API_BASE}${user.avatar}`}
              alt="Avatar"
              className="sidebar-user-avatar"
            />
          ) : (
            <span className="sidebar-user-badge">
              {user?.username?.slice(0, 2).toUpperCase() || 'SG'}
            </span>
          )}
          {!collapsed && (
            <span className="sidebar-label sidebar-username">{user?.username}</span>
          )}
          {!collapsed && (
            <svg className="sidebar-user-gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          )}
        </div>
        {collapsed ? (
          <button className={`sidebar-logout-icon ${logoutConfirm ? 'sidebar-logout--confirm' : ''}`} onClick={(e) => { e.stopPropagation(); handleLogoutClick(); }} title={logoutConfirm ? 'Click again to confirm' : 'Logout'} aria-label="Logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
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

      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  );
}
