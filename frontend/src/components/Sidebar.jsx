import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import projectService from '../services/projectService';
import UserSettingsModal from './UserSettingsModal';
import './Sidebar.css';

function getIdsFromPath(pathname) {
  const projectMatch = pathname.match(/\/projects\/(\d+)/);
  const suiteMatch = pathname.match(/\/suites\/(\d+)/);
  return {
    projectId: projectMatch ? parseInt(projectMatch[1]) : null,
    suiteId: suiteMatch ? parseInt(suiteMatch[1]) : null,
  };
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, isMobile }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: pathProjectId } = getIdsFromPath(location.pathname);
  const newCaseId = new URLSearchParams(location.search).get('newCaseId');
  const [projects, setProjects] = useState([]);
  const [suitesOpen, setSuitesOpen] = useState(true);
  const scrolledToCaseRef = useRef(null);
  const lastProjectIdRef = useRef(null);

  // Remember the last project so the tree stays open on /cases/:id routes
  if (pathProjectId) {
    lastProjectIdRef.current = pathProjectId;
  }
  const currentProjectId = pathProjectId || lastProjectIdRef.current;

  const API_BASE = 'http://localhost:5001';

  const loadProjects = () => {
    projectService.getAll()
      .then(setProjects)
      .catch(() => {});
  };

  useEffect(() => { loadProjects(); }, [currentProjectId]);

  useEffect(() => {
    if (currentProjectId) setSuitesOpen(true);
  }, [currentProjectId]);

  // Expose refresh to window for cross-component updates
  useEffect(() => {
    window.__refreshSidebarProjects = loadProjects;
    return () => { delete window.__refreshSidebarProjects; };
  }, []);

  // Scroll to newly created case in sidebar (delayed after main content)
  useEffect(() => {
    if (newCaseId && projects.length > 0 && scrolledToCaseRef.current !== newCaseId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`sidebar-case-${newCaseId}`);
        if (el) {
          scrolledToCaseRef.current = newCaseId;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('sidebar-case-item--highlight');
          setTimeout(() => el.classList.remove('sidebar-case-item--highlight'), 2500);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [newCaseId, projects]);

  const [collapsedCats, setCollapsedCats] = useState({});

  const toggleCat = (catId) => {
    setCollapsedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

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
        <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} title="Dashboard">
          <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
          <span className="sidebar-label">Dashboard</span>
        </NavLink>

        {collapsed && (
          <NavLink to="/suites" className={({ isActive }) => `sidebar-link ${isActive || location.pathname.includes('/suites') || location.pathname.includes('/cases') ? 'active' : ''}`} title="Test Suites">
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
          <button className="sidebar-section-toggle" onClick={() => { if (collapsed) return; if (suitesOpen) navigate('/'); setSuitesOpen(!suitesOpen); }} title="Test Suites" aria-expanded={suitesOpen && !collapsed}>
            <svg className={`sidebar-icon sidebar-chevron ${suitesOpen && !collapsed ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="sidebar-label">Test Suites</span>
          </button>
          {suitesOpen && !collapsed && (
            <div className="sidebar-submenu">
              {projects.map((p) => {
                const path = p.first_suite_id
                  ? `/projects/${p.id}/suites/${p.first_suite_id}`
                  : `/projects/${p.id}`;
                const isActive = currentProjectId === p.id;
                const categories = p.categories || [];
                return (
                  <div key={p.id} className="sidebar-project-group">
                    <NavLink
                      to={path}
                      className={({ isActive: routeActive }) =>
                        `sidebar-sublink sidebar-suite-link ${routeActive || isActive ? 'active' : ''}`
                      }
                    >
                      <svg className="sidebar-tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      {p.first_suite_name || p.name}
                    </NavLink>
                    {isActive && categories.length > 0 && (() => {
                      // Build tree from flat categories
                      const roots = categories.filter(c => c.parent_id === null || c.parent_id === undefined);
                      const childMap = {};
                      categories.forEach(c => {
                        if (c.parent_id != null) {
                          if (!childMap[c.parent_id]) childMap[c.parent_id] = [];
                          childMap[c.parent_id].push(c);
                        }
                      });
                      // Build cases-by-section map
                      const casesForSection = {};
                      (p.cases || []).forEach(tc => {
                        if (!casesForSection[tc.section_id]) casesForSection[tc.section_id] = [];
                        casesForSection[tc.section_id].push(tc);
                      });
                      return (
                        <div className="sidebar-category-list">
                          {roots.map((cat) => {
                            const catPath = `${path}?categoryId=${cat.id}`;
                            const isCatActive = location.search === `?categoryId=${cat.id}`;
                            const children = childMap[cat.id] || [];
                            const catCases = casesForSection[cat.id] || [];
                            const hasContent = children.length > 0 || catCases.length > 0;
                            const isCatCollapsed = !!collapsedCats[cat.id];
                            return (
                              <div key={cat.id}>
                                <div className={`sidebar-category-item ${isCatActive ? 'active' : ''}`}>
                                  {hasContent && (
                                    <button className="sidebar-cat-toggle" onClick={() => toggleCat(cat.id)}>
                                      <svg className={`sidebar-cat-chevron ${isCatCollapsed ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                      </svg>
                                    </button>
                                  )}
                                  <a
                                    className="sidebar-category-link"
                                    href={catPath}
                                    onClick={(e) => { e.preventDefault(); navigate(catPath); }}
                                  >
                                    <svg className="sidebar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                                    </svg>
                                    {cat.name}
                                  </a>
                                </div>
                                {!isCatCollapsed && (
                                  <>
                                    {catCases.map((tc) => (
                                      <a
                                        key={`tc-${tc.id}`}
                                        id={`sidebar-case-${tc.id}`}
                                        className="sidebar-case-item"
                                        href={`/cases/${tc.id}`}
                                        onClick={(e) => { e.preventDefault(); navigate(`/cases/${tc.id}`); }}
                                      >
                                        <span className="sidebar-case-id">C{String(tc.id).padStart(7, '0')}</span>
                                        <span className="sidebar-case-title">{tc.title}</span>
                                      </a>
                                    ))}
                                    {children.map((sub) => {
                                      const subPath = `${path}?categoryId=${sub.id}`;
                                      const isSubActive = location.search === `?categoryId=${sub.id}`;
                                      const subCases = casesForSection[sub.id] || [];
                                      const isSubCollapsed = !!collapsedCats[`sub-${sub.id}`];
                                      return (
                                        <div key={sub.id}>
                                          <div className={`sidebar-category-item sidebar-subcategory-item ${isSubActive ? 'active' : ''}`}>
                                            {subCases.length > 0 && (
                                              <button className="sidebar-cat-toggle" onClick={() => toggleCat(`sub-${sub.id}`)}>
                                                <svg className={`sidebar-cat-chevron ${isSubCollapsed ? '' : 'open'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                  <polyline points="9 18 15 12 9 6" />
                                                </svg>
                                              </button>
                                            )}
                                            <a
                                              className="sidebar-category-link"
                                              href={subPath}
                                              onClick={(e) => { e.preventDefault(); navigate(subPath); }}
                                            >
                                              <svg className="sidebar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 18 15 12 9 6" />
                                              </svg>
                                              {sub.name}
                                            </a>
                                          </div>
                                          {!isSubCollapsed && subCases.map((tc) => (
                                            <a
                                              key={`tc-${tc.id}`}
                                              id={`sidebar-case-${tc.id}`}
                                              className="sidebar-case-item sidebar-case-item--nested"
                                              href={`/cases/${tc.id}`}
                                              onClick={(e) => { e.preventDefault(); navigate(`/cases/${tc.id}`); }}
                                            >
                                              <span className="sidebar-case-id">C{String(tc.id).padStart(7, '0')}</span>
                                              <span className="sidebar-case-title">{tc.title}</span>
                                            </a>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              {projects.length === 0 && (
                <span className="sidebar-empty">No suites yet</span>
              )}
            </div>
          )}
        </div>

        {!collapsed && (
          <NavLink to="/runs" className={({ isActive }) => `sidebar-link ${isActive || location.pathname.includes('/runs') || location.pathname.includes('/execute') ? 'active' : ''}`} title="Test Runs">
            <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
            <span className="sidebar-label">Test Runs</span>
          </NavLink>
        )}
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
