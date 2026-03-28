import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectDetailPage from './ProjectDetailPage';

// ── Mocks ──────────────────────────────────────────────
vi.mock('../services/projectService', () => ({
  default: {
    getById: vi.fn(),
    getAll: vi.fn(),
    getStats: vi.fn(),
  },
}));
vi.mock('../services/suiteService', () => ({
  default: { getByProject: vi.fn() },
}));
vi.mock('../services/runService', () => ({
  default: { getByProject: vi.fn() },
}));
vi.mock('../services/dashboardService', () => ({
  default: {
    getByProject: vi.fn(),
    getSyncLogs: vi.fn(),
  },
}));
vi.mock('../components/Header', () => ({
  default: ({ breadcrumbs }) => (
    <div data-testid="header">{breadcrumbs?.[0]?.label}</div>
  ),
}));
vi.mock('../components/LoadingSpinner', () => ({
  default: () => <div data-testid="loading-spinner">Loading...</div>,
}));
vi.mock('../constants/statusColors', () => ({
  STATUS_ORDER: ['Passed', 'Failed', 'Blocked', 'Retest', 'Untested'],
}));

import projectService from '../services/projectService';
import suiteService from '../services/suiteService';
import runService from '../services/runService';
import dashboardService from '../services/dashboardService';

// ── Fixtures ──────────────────────────────────────────
const PROJECT = { id: 1, name: 'Automation Overview', description: 'Test project', case_count: 100 };

const SUITES = [
  { id: 1, name: 'P1 Common', case_count: 40, section_count: 10 },
  { id: 2, name: 'P1 Client', case_count: 60, section_count: 15 },
];

const RUNS = [
  {
    id: 1, name: 'Run 1', suite_id: 1, suite_name: 'P1 Common', is_completed: false,
    created_at: '2025-01-15T10:00:00Z',
    stats: { Passed: 30, Failed: 5, Blocked: 2, Retest: 1, Untested: 2, total: 40, pass_rate: 75 },
  },
  {
    id: 2, name: 'Run 2', suite_id: 2, suite_name: 'P1 Client', is_completed: true,
    created_at: '2025-01-14T10:00:00Z',
    stats: { Passed: 50, Failed: 5, Blocked: 3, Retest: 0, Untested: 2, total: 60, pass_rate: 83 },
  },
];

const SUITE_STATS = {
  1: { Passed: 30, Failed: 5, Blocked: 2, Retest: 1, Untested: 2, total: 40, run_id: 1 },
  2: { Passed: 50, Failed: 5, Blocked: 3, Retest: 0, Untested: 2, total: 60, run_id: 2 },
};

const todayStr = new Date().toISOString().slice(0, 10);

const DASHBOARD_DATA = {
  overall_stats: { Passed: 80, Failed: 10, Blocked: 5, Retest: 1, Untested: 4, pass_rate: 80 },
  suite_stats: SUITE_STATS,
  run_dates: [todayStr],
  runs: [
    { id: 1, suite_id: 1, stats: { Passed: 30, Failed: 5, Blocked: 2, Retest: 1, Untested: 2, total: 40 } },
    { id: 2, suite_id: 2, stats: { Passed: 50, Failed: 5, Blocked: 3, Retest: 0, Untested: 2, total: 60 } },
  ],
};

const SYNC_LOGS = [];

function setupMocks() {
  projectService.getById.mockResolvedValue(PROJECT);
  suiteService.getByProject.mockResolvedValue(SUITES);
  runService.getByProject.mockResolvedValue(RUNS);
  dashboardService.getByProject.mockResolvedValue(DASHBOARD_DATA);
  dashboardService.getSyncLogs.mockResolvedValue(SYNC_LOGS);
}

function renderPage(initialUrl = '/projects/1') {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/" element={<div>Guardian Home</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function waitForPageLoad() {
  await waitFor(() => {
    expect(screen.getByText('Test project')).toBeInTheDocument();
  });
}

// ── Tests ──────────────────────────────────────────────
describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupMocks();
  });

  it('shows loading spinner while fetching data', () => {
    // Override ALL service mocks to never resolve
    projectService.getById.mockReturnValue(new Promise(() => {}));
    suiteService.getByProject.mockReturnValue(new Promise(() => {}));
    runService.getByProject.mockReturnValue(new Promise(() => {}));
    dashboardService.getByProject.mockReturnValue(new Promise(() => {}));
    dashboardService.getSyncLogs.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  it('renders project name in header after load', async () => {
    renderPage();
    await waitForPageLoad();
    expect(screen.getByTestId('header')).toHaveTextContent('Automation Overview');
  });

  it('renders project name in page heading after load', async () => {
    renderPage();
    await waitForPageLoad();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Automation Overview');
  });

  it('renders project description', async () => {
    renderPage();
    await waitForPageLoad();
    expect(screen.getByText('Test project')).toBeInTheDocument();
  });

  it('renders three tabs with correct counts', async () => {
    renderPage();
    await waitForPageLoad();
    expect(screen.getByText('Test Suites (2)')).toBeInTheDocument();
    expect(screen.getByText('Test Runs (2)')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  // ── Suites Tab ──
  describe('Suites tab', () => {
    it('shows suite cards when clicking Suites tab', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Suites (2)'));
      expect(screen.getByText('P1 Common')).toBeInTheDocument();
      expect(screen.getByText('P1 Client')).toBeInTheDocument();
    });

    it('shows section and case counts per suite', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Suites (2)'));
      expect(screen.getByText(/10 sections with 40 test cases/)).toBeInTheDocument();
      expect(screen.getByText(/15 sections with 60 test cases/)).toBeInTheDocument();
    });

    it('shows active run count for suites with active runs', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Suites (2)'));
      expect(screen.getByText(/1 active test run\./)).toBeInTheDocument();
    });

    it('shows "No active test runs" for completed runs', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Suites (2)'));
      expect(screen.getByText(/No active test runs\./)).toBeInTheDocument();
    });

    it('shows empty message when no suites exist', async () => {
      suiteService.getByProject.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Suites (0)')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Test Suites (0)'));
      expect(screen.getByText('No test suites yet.')).toBeInTheDocument();
    });
  });

  // ── Runs Tab ──
  describe('Runs tab', () => {
    it('shows run table when clicking Runs tab', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Runs (2)'));
      expect(screen.getByText('Run 1')).toBeInTheDocument();
      expect(screen.getByText('Run 2')).toBeInTheDocument();
    });

    it('shows Active badge for incomplete runs', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Runs (2)'));
      expect(document.querySelector('.badge-active')).toBeInTheDocument();
    });

    it('shows pass rate in mini-bar label', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();
      await user.click(screen.getByText('Test Runs (2)'));
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('83%')).toBeInTheDocument();
    });

    it('shows empty message when no runs exist', async () => {
      runService.getByProject.mockResolvedValue([]);
      const user = userEvent.setup();
      renderPage();
      await waitFor(() => screen.getByText('Test Runs (0)'));
      await user.click(screen.getByText('Test Runs (0)'));
      expect(screen.getByText('No test runs yet.')).toBeInTheDocument();
    });
  });

  // ── Overview Tab (default) ──
  describe('Overview tab', () => {
    it('renders 4 stat tiles', async () => {
      renderPage();
      await waitForPageLoad();
      const tiles = document.querySelectorAll('.ov-stat-tile');
      expect(tiles).toHaveLength(4);
    });

    it('shows correct total cases count', async () => {
      renderPage();
      await waitForPageLoad();
      // Total cases = 40 + 60 = 100
      const tilesContainer = document.querySelector('.ov-tiles');
      expect(within(tilesContainer).getByText('100')).toBeInTheDocument();
      expect(within(tilesContainer).getByText('Test Cases')).toBeInTheDocument();
    });

    it('shows correct suites count', async () => {
      renderPage();
      await waitForPageLoad();
      expect(screen.getByText('Suites')).toBeInTheDocument();
      // Find the tile that contains "Suites" label and check its count
      const suitesLabel = screen.getByText('Suites');
      const tile = suitesLabel.closest('.ov-stat-tile');
      expect(within(tile).getByText('2')).toBeInTheDocument();
    });

    it('shows correct test runs count', async () => {
      renderPage();
      await waitForPageLoad();
      // The "Test Runs" label is in the stat tile (distinct from the tab label "Test Runs (2)")
      const tilesContainer = document.querySelector('.ov-tiles');
      expect(within(tilesContainer).getByText('Test Runs')).toBeInTheDocument();
    });

    it('shows correct sections count', async () => {
      renderPage();
      await waitForPageLoad();
      // 10 + 15 = 25 sections
      const sectionsLabel = screen.getByText('Sections');
      const tile = sectionsLabel.closest('.ov-stat-tile');
      expect(within(tile).getByText('25')).toBeInTheDocument();
    });

    it('renders Suite Health heading', async () => {
      renderPage();
      await waitForPageLoad();
      expect(screen.getByText('Suite Health')).toBeInTheDocument();
    });

    it('renders suite health cards with names', async () => {
      renderPage();
      await waitForPageLoad();
      expect(screen.getByText('P1 Common')).toBeInTheDocument();
      expect(screen.getByText('P1 Client')).toBeInTheDocument();
    });

    it('renders suite health cards with case and section counts', async () => {
      renderPage();
      await waitForPageLoad();
      expect(screen.getByText(/40 cases/)).toBeInTheDocument();
      expect(screen.getByText(/60 cases/)).toBeInTheDocument();
      expect(screen.getByText(/10 sections/)).toBeInTheDocument();
      expect(screen.getByText(/15 sections/)).toBeInTheDocument();
    });

    it('renders suite health mini-bars when run data exists', async () => {
      renderPage();
      await waitForPageLoad();
      const bars = document.querySelectorAll('.ov-suite-card-bar');
      expect(bars.length).toBeGreaterThan(0);
    });

    it('suite cards are links to run detail when run_id exists', async () => {
      renderPage();
      await waitForPageLoad();
      const commonLink = screen.getByText('P1 Common').closest('a');
      expect(commonLink).toHaveAttribute('href', '/runs/1');
      const clientLink = screen.getByText('P1 Client').closest('a');
      expect(clientLink).toHaveAttribute('href', '/runs/2');
    });

    it('shows empty message when no suites have stats', async () => {
      dashboardService.getByProject.mockResolvedValue({
        overall_stats: {},
        suite_stats: {},
        run_dates: [],
        runs: [],
      });
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Suite Health')).toBeInTheDocument();
      });
      expect(screen.getByText('No test results for this date.')).toBeInTheDocument();
    });

    it('stat tiles are not interactive (rendered as divs)', async () => {
      renderPage();
      await waitForPageLoad();
      const tiles = document.querySelectorAll('.ov-stat-tile');
      tiles.forEach((tile) => {
        expect(tile.tagName).toBe('DIV');
        expect(tile).not.toHaveAttribute('role', 'button');
      });
    });

    it('computes totals from suite data, not from run stats', async () => {
      dashboardService.getByProject.mockResolvedValue({
        overall_stats: {},
        suite_stats: {},
        run_dates: [],
        runs: [],
      });
      renderPage();
      await waitForPageLoad();
      // case_count from suites: 40 + 60 = 100
      const tilesContainer = document.querySelector('.ov-tiles');
      expect(within(tilesContainer).getByText('100')).toBeInTheDocument();
    });
  });

  // ── Tab Switching ──
  describe('Tab switching', () => {
    it('switches between tabs correctly', async () => {
      const user = userEvent.setup();
      renderPage();
      await waitForPageLoad();

      // Default: overview tab (has Suite Health)
      expect(screen.getByText('Suite Health')).toBeInTheDocument();

      // Switch to suites
      await user.click(screen.getByText('Test Suites (2)'));
      expect(screen.getByText('P1 Common')).toBeInTheDocument();
      expect(screen.queryByText('Suite Health')).not.toBeInTheDocument();

      // Switch to runs
      await user.click(screen.getByText('Test Runs (2)'));
      expect(screen.getByText('Run 1')).toBeInTheDocument();
      expect(screen.queryByText('Suite Health')).not.toBeInTheDocument();

      // Switch back to overview
      await user.click(screen.getByText('Overview'));
      expect(screen.getByText('Suite Health')).toBeInTheDocument();
    });
  });

  // ── API calls ──
  describe('API integration', () => {
    it('calls all 5 service methods with correct project ID', async () => {
      renderPage();
      await waitForPageLoad();
      expect(projectService.getById).toHaveBeenCalledWith('1');
      expect(suiteService.getByProject).toHaveBeenCalledWith('1');
      expect(runService.getByProject).toHaveBeenCalledWith('1');
      expect(dashboardService.getByProject).toHaveBeenCalledWith('1', { date: todayStr });
      expect(dashboardService.getSyncLogs).toHaveBeenCalledWith({ project_id: '1', limit: 10 });
    });

    it('navigates to dashboard on API error', async () => {
      projectService.getById.mockRejectedValue(new Error('Not found'));
      suiteService.getByProject.mockRejectedValue(new Error('Not found'));
      runService.getByProject.mockRejectedValue(new Error('Not found'));
      dashboardService.getByProject.mockRejectedValue(new Error('Not found'));
      dashboardService.getSyncLogs.mockRejectedValue(new Error('Not found'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Guardian Home')).toBeInTheDocument();
      });
    });
  });
});