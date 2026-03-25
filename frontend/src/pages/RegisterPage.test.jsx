import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RegisterPage from './RegisterPage';

// ── Mocks ──
const mockRegister = vi.fn();

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual('../context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      register: mockRegister,
      user: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      updateAvatar: vi.fn(),
    }),
  };
});

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div>Guardian</div>} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──
  it('renders create account heading', () => {
    renderRegister();
    expect(screen.getByText('Create your account')).toBeInTheDocument();
  });

  it('renders subtitle', () => {
    renderRegister();
    expect(screen.getByText('Get started with test management')).toBeInTheDocument();
  });

  it('renders brand logo', () => {
    renderRegister();
    expect(screen.getByAltText('StyleSeat Regression Guard')).toBeInTheDocument();
  });

  it('renders username input', () => {
    renderRegister();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
  });

  it('renders email input', () => {
    renderRegister();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('renders password input', () => {
    renderRegister();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders sign up button', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders link to login page', () => {
    renderRegister();
    const link = screen.getByText('Log in');
    expect(link).toHaveAttribute('href', '/login');
  });

  it('renders trademark', () => {
    renderRegister();
    expect(screen.getByText('Designed by StyleSeat')).toBeInTheDocument();
  });

  // ── Form interaction ──
  it('allows typing in all fields', async () => {
    const user = userEvent.setup();
    renderRegister();

    const username = screen.getByLabelText('Username');
    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');

    await user.type(username, 'newuser');
    await user.type(email, 'newuser@styleseat.com');
    await user.type(password, 'Str0ngPass!');

    expect(username).toHaveValue('newuser');
    expect(email).toHaveValue('newuser@styleseat.com');
    expect(password).toHaveValue('Str0ngPass!');
  });

  // ── Form submission ──
  it('calls register with username, email, and password on submit', async () => {
    mockRegister.mockResolvedValue({});
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(mockRegister).toHaveBeenCalledWith('newuser', 'new@styleseat.com', 'Pass1234');
  });

  it('shows loading state while submitting', async () => {
    mockRegister.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByText('Creating account...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled();
  });

  it('navigates to dashboard on successful registration', async () => {
    mockRegister.mockResolvedValue({});
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('Guardian')).toBeInTheDocument();
    });
  });

  // ── Error handling ──
  it('shows generic error message on failure', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { error: 'Unable to create account. Please contact your administrator.' } },
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('Unable to create account. Please contact your administrator.')).toBeInTheDocument();
    });
  });

  it('shows fallback error when no response data', async () => {
    mockRegister.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('Registration failed')).toBeInTheDocument();
    });
  });

  it('shows password requirement errors', async () => {
    mockRegister.mockRejectedValue({
      response: {
        data: {
          password_errors: [
            'At least 8 characters',
            'At least one uppercase letter',
            'At least one number',
          ],
        },
      },
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('Password must contain:')).toBeInTheDocument();
    });
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('At least one uppercase letter')).toBeInTheDocument();
    expect(screen.getByText('At least one number')).toBeInTheDocument();
  });

  it('clears error when typing in username field', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { error: 'Registration failed' } },
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'x');
    await user.type(screen.getByLabelText('Email'), 'x@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('Registration failed')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Username'), 'a');
    expect(screen.queryByText('Registration failed')).not.toBeInTheDocument();
  });

  it('clears password errors when typing in any field', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { password_errors: ['At least 8 characters'] } },
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'weak');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Password'), 'X');
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
  });

  it('re-enables button after failed registration', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { error: 'Failed' } },
    });
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Username'), 'newuser');
    await user.type(screen.getByLabelText('Email'), 'new@styleseat.com');
    await user.type(screen.getByLabelText('Password'), 'Pass1234');
    await user.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign Up' })).not.toBeDisabled();
    });
  });
});
