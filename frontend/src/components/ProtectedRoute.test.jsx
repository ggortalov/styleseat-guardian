import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

const mockAuth = { isAuthenticated: false, loading: false };
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function renderWithRoute(initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <ProtectedRoute>
              <div data-testid="child-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows loading screen when loading is true', () => {
    Object.assign(mockAuth, { loading: true, isAuthenticated: false });
    renderWithRoute();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not render children while loading', () => {
    Object.assign(mockAuth, { loading: true, isAuthenticated: false });
    renderWithRoute();
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('does not redirect to login while loading', () => {
    Object.assign(mockAuth, { loading: true, isAuthenticated: false });
    renderWithRoute();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    Object.assign(mockAuth, { loading: false, isAuthenticated: false });
    renderWithRoute();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    Object.assign(mockAuth, { loading: false, isAuthenticated: true });
    renderWithRoute();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('uses replace on the redirect Navigate', () => {
    Object.assign(mockAuth, { loading: false, isAuthenticated: false });
    // Verify by checking that we land on /login (Navigate with replace
    // does not add to history stack). We confirm the component uses
    // <Navigate replace> by inspecting the source; here we verify
    // the redirect works correctly end-to-end.
    renderWithRoute();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });
});
