import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mock AuthContext ---
const mockAuth = {
  isAuthenticated: false,
  loading: false,
  user: null,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  updateAvatar: vi.fn(),
};

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => mockAuth,
}));

// --- Mock service layer (used by real page components) ---
const mockGetAll = vi.fn();
vi.mock('./services/projectService', () => ({
  default: { getAll: (...args) => mockGetAll(...args) },
}));

vi.mock('./services/dashboardService', () => ({
  default: { getGlobal: vi.fn(() => Promise.resolve({ projects: [], totals: { suites: 0, cases: 0 }, suites: [] })) },
}));

vi.mock('./services/runService', () => ({
  default: { getAll: vi.fn(() => Promise.resolve({ items: [], total: 0 })) },
}));

// --- Mock Sidebar (makes service calls we don't want here) ---
vi.mock('./components/Sidebar', () => ({
  default: () => <div data-testid="sidebar">Sidebar</div>,
}));

// --- Pages rendered for real: LoginPage, RegisterPage, TestSuitesPage, TestRunsPage ---
// (no vi.mock for these — they render their actual DOM)

// --- Stub pages with heavy service dependencies ---
vi.mock('./pages/ProjectDetailPage', () => ({
  default: () => <div data-testid="project-detail-page">ProjectDetailPage</div>,
}));

vi.mock('./pages/TestSuitePage', () => ({
  default: () => <div data-testid="test-suite-page">TestSuitePage</div>,
}));

vi.mock('./pages/TestCaseFormPage', () => ({
  default: () => <div data-testid="test-case-form-page">TestCaseFormPage</div>,
}));

vi.mock('./pages/TestCaseDetailPage', () => ({
  default: () => <div data-testid="test-case-detail-page">TestCaseDetailPage</div>,
}));

vi.mock('./pages/TestRunDetailPage', () => ({
  default: () => <div data-testid="test-run-detail-page">TestRunDetailPage</div>,
}));

vi.mock('./pages/TestExecutionPage', () => ({
  default: () => <div data-testid="test-execution-page">TestExecutionPage</div>,
}));

import App from './App';

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

beforeEach(() => {
  Object.assign(mockAuth, {
    isAuthenticated: false,
    loading: false,
    user: null,
  });
  mockGetAll.mockReset();
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

describe('App routing', () => {
  describe('Public routes — real LoginPage', () => {
    it('/login renders the sign-in form with username and password fields', async () => {
      renderApp('/login');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument();
    });

    it('/login renders a link to the register page', async () => {
      renderApp('/login');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
      const signUpLink = screen.getByRole('link', { name: 'Sign up' });
      expect(signUpLink).toHaveAttribute('href', '/register');
    });

    it('/login renders LoginPage even when authenticated', async () => {
      Object.assign(mockAuth, { isAuthenticated: true, user: { id: 1, username: 'demo' } });
      renderApp('/login');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });
  });

  describe('Public routes — real RegisterPage', () => {
    it('/register renders the registration form with username, email, and password', async () => {
      renderApp('/register');
      await waitFor(() => {
        expect(screen.getByText('Create your account')).toBeInTheDocument();
      });
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    });

    it('/register renders a link back to login', async () => {
      renderApp('/register');
      await waitFor(() => {
        expect(screen.getByText('Create your account')).toBeInTheDocument();
      });
      const loginLink = screen.getByRole('link', { name: 'Log in' });
      expect(loginLink).toHaveAttribute('href', '/login');
    });
  });

  describe('Protected route redirection (not authenticated)', () => {
    it('/ redirects to /login', async () => {
      renderApp('/');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });

    it('/projects/1 redirects to /login', async () => {
      renderApp('/projects/1');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });

    it('/suites redirects to /login', async () => {
      renderApp('/suites');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });

    it('/runs redirects to /login', async () => {
      renderApp('/runs');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });

    it('/runs/1 redirects to /login', async () => {
      renderApp('/runs/1');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });

    it('/cases/1 redirects to /login', async () => {
      renderApp('/cases/1');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
    });
  });

  describe('Protected routes — real pages when authenticated', () => {
    beforeEach(() => {
      Object.assign(mockAuth, { isAuthenticated: true, user: { id: 1, username: 'demo' } });
    });

    it('/suites renders TestSuitesPage with real heading and add-suite button', async () => {
      renderApp('/suites');
      await waitFor(() => {
        expect(screen.getByText('Test Suites')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: '+ Add New Suite' })).toBeInTheDocument();
    });

    it('/suites shows empty state when no suites exist', async () => {
      renderApp('/suites');
      await waitFor(() => {
        expect(screen.getByText(/No test suites yet/)).toBeInTheDocument();
      });
    });

    it('/runs renders TestRunsPage with real heading', async () => {
      renderApp('/runs');
      await waitFor(() => {
        expect(screen.getByText('Test Runs')).toBeInTheDocument();
      });
    });

    it('/runs shows empty state when no runs exist', async () => {
      renderApp('/runs');
      await waitFor(() => {
        expect(screen.getByText(/No test runs yet/)).toBeInTheDocument();
      });
    });

    it('/projects/1 renders ProjectDetailPage (stubbed)', async () => {
      renderApp('/projects/1');
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('/runs/1 renders TestRunDetailPage (stubbed)', async () => {
      renderApp('/runs/1');
      await waitFor(() => {
        expect(screen.getByTestId('test-run-detail-page')).toBeInTheDocument();
      });
    });
  });

  describe('ProjectRedirect (/ route)', () => {
    beforeEach(() => {
      Object.assign(mockAuth, { isAuthenticated: true, user: { id: 1, username: 'demo' } });
    });

    it('redirects to /projects/{id} when projects exist', async () => {
      mockGetAll.mockResolvedValue([{ id: 42, name: 'Test Project' }]);
      renderApp('/');
      await waitFor(() => {
        expect(screen.getByTestId('project-detail-page')).toBeInTheDocument();
      });
    });

    it('falls back to TestSuitesPage when no projects exist', async () => {
      mockGetAll.mockResolvedValue([]);
      renderApp('/');
      await waitFor(() => {
        expect(screen.getByText('Test Suites')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: '+ Add New Suite' })).toBeInTheDocument();
    });

    it('shows loading spinner while fetching projects', async () => {
      mockGetAll.mockReturnValue(new Promise(() => {}));
      renderApp('/');
      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument();
      });
    });

    it('falls back to TestSuitesPage on API error', async () => {
      mockGetAll.mockRejectedValue(new Error('Network error'));
      renderApp('/');
      await waitFor(() => {
        expect(screen.getByText('Test Suites')).toBeInTheDocument();
      });
    });
  });

  describe('AppLayout', () => {
    it('renders sidebar for authenticated users', async () => {
      Object.assign(mockAuth, { isAuthenticated: true, user: { id: 1, username: 'demo' } });
      renderApp('/suites');
      await waitFor(() => {
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      });
    });

    it('does not render sidebar on login page', async () => {
      renderApp('/login');
      await waitFor(() => {
        expect(screen.getByText('Sign in')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    });
  });
});
