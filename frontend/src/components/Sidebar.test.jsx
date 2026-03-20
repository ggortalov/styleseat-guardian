import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

// ── Mocks ──
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'demo', avatar: null },
    logout: vi.fn(),
    updateAvatar: vi.fn(),
  }),
}));

vi.mock('../services/projectService', () => ({
  default: {
    getAll: vi.fn().mockResolvedValue([
      { id: 1, name: 'Project A', suites: [{ id: 10, name: 'Suite X', case_count: 5 }] },
    ]),
  },
}));

vi.mock('../services/runService', () => ({
  default: {
    getAll: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

vi.mock('../services/authService', () => ({
  default: {
    uploadAvatar: vi.fn(),
  },
}));

function renderSidebar(props = {}) {
  const defaultProps = {
    collapsed: false,
    onToggleCollapse: vi.fn(),
    mobileOpen: false,
    isMobile: false,
    ...props,
  };
  return render(
    <MemoryRouter>
      <Sidebar {...defaultProps} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders brand logo and wordmark', () => {
    renderSidebar();
    expect(screen.getByAltText('StyleSeat Guardian')).toBeInTheDocument();
    expect(screen.getByText(/StyleSeat/)).toBeInTheDocument();
    expect(screen.getByText('Guardian')).toBeInTheDocument();
  });

  it('renders Overview nav link', () => {
    renderSidebar();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('renders Test Suites section toggle', () => {
    renderSidebar();
    expect(screen.getAllByText('Test Suites').length).toBeGreaterThan(0);
  });

  it('renders Test Runs section toggle', () => {
    renderSidebar();
    expect(screen.getAllByText('Test Runs').length).toBeGreaterThan(0);
  });

  it('renders username in footer', () => {
    renderSidebar();
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('renders avatar initials when no avatar image', () => {
    renderSidebar();
    expect(screen.getByText('DE')).toBeInTheDocument();
  });

  it('renders logout button', () => {
    renderSidebar();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('hides wordmark when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('Guardian')).not.toBeInTheDocument();
  });

  it('hides username when collapsed', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('demo')).not.toBeInTheDocument();
  });

  it('renders collapse button with correct label', () => {
    renderSidebar();
    expect(screen.getByLabelText('Collapse sidebar')).toBeInTheDocument();
  });

  it('renders close button on mobile', () => {
    renderSidebar({ isMobile: true, mobileOpen: true });
    expect(screen.getByLabelText('Close menu')).toBeInTheDocument();
  });

  it('calls onToggleCollapse when collapse button clicked', async () => {
    const onToggle = vi.fn();
    renderSidebar({ onToggleCollapse: onToggle });
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Collapse sidebar'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('applies mobile CSS classes', () => {
    const { container } = renderSidebar({ isMobile: true, mobileOpen: true });
    const sidebar = container.querySelector('.sidebar');
    expect(sidebar).toHaveClass('sidebar--mobile');
    expect(sidebar).toHaveClass('sidebar--mobile-open');
  });

  it('applies collapsed CSS class', () => {
    const { container } = renderSidebar({ collapsed: true });
    const sidebar = container.querySelector('.sidebar');
    expect(sidebar).toHaveClass('sidebar--collapsed');
  });

  it('shows suites in submenu when Test Suites section is expanded', async () => {
    const user = userEvent.setup();
    renderSidebar();

    // Click the Test Suites section toggle to expand (suitesOpen starts false)
    const toggleButtons = screen.getAllByTitle('Test Suites');
    await user.click(toggleButtons[0]);

    // Wait for projects to load and suites to render
    await waitFor(() => {
      expect(screen.getByText('Suite X')).toBeInTheDocument();
    });
  });

  it('shows "No runs yet" when no runs exist', async () => {
    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText('No runs yet')).toBeInTheDocument();
    });
  });

  it('shows confirm state on first logout click', async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByText('Logout'));
    expect(screen.getByText('Confirm?')).toBeInTheDocument();
  });
});
