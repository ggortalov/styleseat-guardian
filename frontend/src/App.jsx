import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import LoadingSpinner from './components/LoadingSpinner';

// Auth pages — small, loaded eagerly for instant first paint
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// App pages — lazy loaded, only fetched after login
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage'));
const TestSuitePage = lazy(() => import('./pages/TestSuitePage'));
const TestCaseFormPage = lazy(() => import('./pages/TestCaseFormPage'));
const TestCaseDetailPage = lazy(() => import('./pages/TestCaseDetailPage'));
const TestRunDetailPage = lazy(() => import('./pages/TestRunDetailPage'));
const TestExecutionPage = lazy(() => import('./pages/TestExecutionPage'));

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

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [location.pathname, isMobile]);

  if (!isAuthenticated) return children;

  const collapsed = isMobile ? false : sidebarCollapsed;

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
      />
      <main className={`app-main ${!isMobile && sidebarCollapsed ? 'app-main--collapsed' : ''} ${isMobile ? 'app-main--mobile' : ''}`}>
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <AppLayout>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
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
      <AppRoutes />
    </AuthProvider>
  );
}
