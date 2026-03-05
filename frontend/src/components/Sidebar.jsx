import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useRef } from 'react';
import projectService from '../services/projectService';
import authService from '../services/authService';
import './Sidebar.css';

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, isMobile }) {
  const { user, logout, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
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

  useEffect(() => {
    projectService.getAll().then(setProjects).catch(() => {});
  }, []);

  const refreshProjects = () => {
    projectService.getAll().then(setProjects).catch(() => {});
  };

  // Expose refresh to window for cross-component updates
  useEffect(() => {
    window.__refreshSidebarProjects = refreshProjects;
    return () => { delete window.__refreshSidebarProjects; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${isMobile ? 'sidebar--mobile' : ''} ${isMobile && mobileOpen ? 'sidebar--mobile-open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="sidebar-logo">{collapsed ? 'S' : 'StyleGuard'}</h1>
        {isMobile ? (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <button className="sidebar-collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <polyline points="9 18 15 12 9 6" />
                : <polyline points="15 18 9 12 15 6" />
              }
            </svg>
          </button>
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
          <button className="sidebar-section-toggle" onClick={() => !collapsed && setProjectsOpen(!projectsOpen)} title="Test Suites">
            <svg className={`sidebar-icon sidebar-chevron ${projectsOpen && !collapsed ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="sidebar-label">Test Suites</span>
          </button>
          {projectsOpen && !collapsed && (
            <div className="sidebar-submenu">
              {projects.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className={({ isActive }) => `sidebar-sublink ${isActive ? 'active' : ''}`}
                >
                  {p.name}
                </NavLink>
              ))}
              {projects.length === 0 && (
                <span className="sidebar-empty">No projects yet</span>
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
        {!collapsed && (
          <button className="sidebar-logout" onClick={handleLogout}>
            Logout
          </button>
        )}
      </div>
    </aside>
  );
}
