import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import LoginPage from './LoginPage';

// ── Mocks ──
const mockLogin = vi.fn();

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      login: mockLogin,
      user: null,
      isAuthenticated: false,
      loading: false,
      logout: vi.fn(),
      register: vi.fn(),
      updateAvatar: vi.fn(),
    }),
  };
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/register" element={<div>Register Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──
  it('renders sign in heading', () => {
    renderLogin();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    renderLogin();
    expect(screen.getByText('Enter your credentials to continue')).toBeInTheDocument();
  });

  it('renders brand logo', () => {
    renderLogin();
    expect(screen.getByAltText('StyleSeat Regression Guard')).toBeInTheDocument();
  });

  it('renders username input', () => {
    renderLogin();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders password input', () => {
    renderLogin();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders remember me checkbox', () => {
    renderLogin();
    expect(screen.getByText('Remember me')).toBeInTheDocument();
  });

  it('renders log in button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument();
  });

  it('renders link to register page', () => {
    renderLogin();
    const link = screen.getByText('Sign up');
    expect(link).toHaveAttribute('href', '/register');
  });

  it('renders trademark', () => {
    renderLogin();
    expect(screen.getByText('Designed by StyleSeat')).toBeInTheDocument();
  });

  // ── Form interaction ──
  it('allows typing in username field', async () => {
    const user = userEvent.setup();
    renderLogin();
    const input = screen.getByLabelText('Username');
    await user.type(input, 'demo');
    expect(input).toHaveValue('demo');
  });

  it('allows typing in password field', async () => {
    const user = userEvent.setup();
    renderLogin();
    const input = screen.getByLabelText('Password');
    await user.type(input, 'secret123');
    expect(input).toHaveValue('secret123');
  });

  it('allows toggling remember me checkbox', async () => {
    const user = userEvent.setup();
    renderLogin();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  // ── Form submission ──
  it('calls login with username, password, and rememberMe on submit', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'Demo1234');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(mockLogin).toHaveBeenCalledWith('demo', 'Demo1234', false);
  });

  it('passes rememberMe=true when checkbox is checked', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'Demo1234');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(mockLogin).toHaveBeenCalledWith('demo', 'Demo1234', true);
  });

  it('shows loading state while submitting', async () => {
    mockLogin.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    expect(screen.getByText('Logging in...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logging in...' })).toBeDisabled();
  });

  it('navigates to dashboard on successful login', async () => {
    mockLogin.mockResolvedValue({});
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'Demo1234');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  // ── Error handling ──
  it('shows error message on login failure', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid username or password' } },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'wrong');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });
  });

  it('shows generic error when no response data', async () => {
    mockLogin.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('clears error when typing in username field', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid username or password' } },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'wrong');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Username'), 'a');
    expect(screen.queryByText('Invalid username or password')).not.toBeInTheDocument();
  });

  it('clears error when typing in password field', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid username or password' } },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'wrong');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Password'), 'x');
    expect(screen.queryByText('Invalid username or password')).not.toBeInTheDocument();
  });

  it('re-enables button after failed login', async () => {
    mockLogin.mockRejectedValue({
      response: { data: { error: 'Invalid' } },
    });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Username'), 'demo');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log In' })).not.toBeDisabled();
    });
  });
});
