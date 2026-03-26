import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ImportProvider, ImportToast } from './context/ImportContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import LoadingSpinner from './components/LoadingSpinner';
import projectService from './services/projectService';

// Auth pages — small, loaded eagerly for instant first paint
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// App pages — lazy loaded, only fetched after login
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TestSuitePage = lazy(() => import('./pages/TestSuitePage'));
const TestCaseFormPage = lazy(() => import('./pages/TestCaseFormPage'));
const TestCaseDetailPage = lazy(() => import('./pages/TestCaseDetailPage'));
const TestRunDetailPage = lazy(() => import('./pages/TestRunDetailPage'));
const TestExecutionPage = lazy(() => import('./pages/TestExecutionPage'));
const TestSuitesPage = lazy(() => import('./pages/TestSuitesPage'));
const TestRunsPage = lazy(() => import('./pages/TestRunsPage'));

const MOBILE_BREAKPOINT = 768;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

function AppLayout({ children }) {
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  // Draggable sidebar width
  const SIDEBAR_MIN = 200;
  const SIDEBAR_MAX = 500;
  const SIDEBAR_DEFAULT = 270;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parseInt(saved, 10))) : SIDEBAR_DEFAULT;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev) => {
      const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, ev.clientX));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setSidebarWidth((w) => {
        localStorage.setItem('sidebarWidth', String(w));
        return w;
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => {
        localStorage.setItem('sidebarCollapsed', String(!prev));
        return !prev;
      });
    }
  }, [isMobile]);

  // Close mobile sidebar on navigation & scroll to top
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
    window.scrollTo(0, 0);
    document.querySelector('.app-main')?.scrollTo(0, 0);
  }, [location.pathname, isMobile]);

  if (!isAuthenticated) return children;

  const collapsed = isMobile ? false : sidebarCollapsed;
  const effectiveWidth = collapsed ? undefined : sidebarWidth;

  return (
    <div className="app-layout">
      {isMobile && (
        <button className="mobile-hamburger" onClick={toggleSidebar} aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}
      {isMobile && mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        isMobile={isMobile}
        width={effectiveWidth}
        onResizeStart={handleResizeStart}
        isResizing={isDragging}
      />
      <main
        className={`app-main ${!isMobile && sidebarCollapsed ? 'app-main--collapsed' : ''} ${isMobile ? 'app-main--mobile' : ''}`}
        style={!isMobile && !collapsed ? { marginLeft: sidebarWidth, transition: isDragging ? 'none' : undefined } : undefined}
      >
        {children}
        <ImportToast />
      </main>
    </div>
  );
}

function ProjectRedirect() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    projectService.getAll()
      .then((projects) => {
        if (projects.length > 0) {
          navigate(`/projects/${projects[0].id}`, { replace: true });
        } else {
          setChecked(true);
        }
      })
      .catch(() => setChecked(true));
  }, [navigate]);

  if (!checked) return <LoadingSpinner />;
  return <TestSuitesPage />;
}

function AppRoutes() {
  return (
    <AppLayout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><ProjectRedirect /></ProtectedRoute>} />
          <Route path="/suites" element={<ProtectedRoute><TestSuitesPage /></ProtectedRoute>} />
          <Route path="/runs" element={<ProtectedRoute><TestRunsPage /></ProtectedRoute>} />
          <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectDetailPage /></ProtectedRoute>} />
          <Route path="/projects/:projectId/suites/:suiteId" element={<ProtectedRoute><TestSuitePage /></ProtectedRoute>} />
          <Route path="/projects/:projectId/suites/:suiteId/cases/new" element={<ProtectedRoute><TestCaseFormPage /></ProtectedRoute>} />
          <Route path="/projects/:projectId/suites/:suiteId/cases/:caseId/edit" element={<ProtectedRoute><TestCaseFormPage /></ProtectedRoute>} />
          <Route path="/cases/:caseId" element={<ProtectedRoute><TestCaseDetailPage /></ProtectedRoute>} />
          <Route path="/runs/:runId" element={<ProtectedRoute><TestRunDetailPage /></ProtectedRoute>} />
          <Route path="/runs/:runId/execute/:resultId" element={<ProtectedRoute><TestExecutionPage /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ImportProvider>
        <AppRoutes />
      </ImportProvider>
    </AuthProvider>
  );
}
