import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import projectService from '../services/projectService';
import authService from '../services/authService';
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
  const { user, logout, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId: currentProjectId } = getIdsFromPath(location.pathname);
  const [projects, setProjects] = useState([]);
  const [suitesOpen, setSuitesOpen] = useState(true);
  const fileInputRef = useRef(null);

  const API_BASE = 'http://localhost:5001';

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await authService.uploadAvatar(file);
      updateAvatar(data.avatar);
    } catch {
      // silently fail
    }
    e.target.value = '';
  };

  const loadProjects = () => {
    projectService.getAll()
      .then(setProjects)
      .catch(() => {});
  };

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    if (currentProjectId) setSuitesOpen(true);
  }, [currentProjectId]);

  // Expose refresh to window for cross-component updates
  useEffect(() => {
    window.__refreshSidebarProjects = loadProjects;
    return () => { delete window.__refreshSidebarProjects; };
  }, []);

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
      onClickCapture={collapsed && !isMobile ? (e) => { e.stopPropagation(); e.preventDefault(); onToggleCollapse(); } : undefined}
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
                      return (
                        <div className="sidebar-category-list">
                          {roots.map((cat) => {
                            const catPath = `${path}?categoryId=${cat.id}`;
                            const isCatActive = location.search === `?categoryId=${cat.id}`;
                            const children = childMap[cat.id] || [];
                            return (
                              <div key={cat.id}>
                                <a
                                  className={`sidebar-category-item ${isCatActive ? 'active' : ''}`}
                                  href={catPath}
                                  onClick={(e) => { e.preventDefault(); navigate(catPath); }}
                                >
                                  <svg className="sidebar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                                  </svg>
                                  {cat.name}
                                </a>
                                {children.map((sub) => {
                                  const subPath = `${path}?categoryId=${sub.id}`;
                                  const isSubActive = location.search === `?categoryId=${sub.id}`;
                                  return (
                                    <a
                                      key={sub.id}
                                      className={`sidebar-category-item sidebar-subcategory-item ${isSubActive ? 'active' : ''}`}
                                      href={subPath}
                                      onClick={(e) => { e.preventDefault(); navigate(subPath); }}
                                    >
                                      <svg className="sidebar-category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                      </svg>
                                      {sub.name}
                                    </a>
                                  );
                                })}
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
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png"
            style={{ display: 'none' }}
          />
          {user?.avatar ? (
            <img
              src={`${API_BASE}${user.avatar}`}
              alt="Avatar"
              className="sidebar-user-avatar"
              onClick={handleAvatarClick}
              title="Click to change avatar"
            />
          ) : (
            <span className="sidebar-user-badge" onClick={handleAvatarClick} title="Click to set avatar">
              {user?.username?.slice(0, 2).toUpperCase() || 'SG'}
            </span>
          )}
          <span className="sidebar-label sidebar-username">{user?.username}</span>
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
    </aside>
  );
}
