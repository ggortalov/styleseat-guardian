import { describe, it, expect, vi, beforeEach } from 'vitest';
import dashboardService from './dashboardService';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getGlobal calls GET /dashboard', async () => {
    api.get.mockResolvedValue({ data: { projects: [], totals: {} } });
    const result = await dashboardService.getGlobal();
    expect(api.get).toHaveBeenCalledWith('/dashboard');
    expect(result).toEqual({ projects: [], totals: {} });
  });

  it('getByProject calls GET /projects/:pid/dashboard', async () => {
    api.get.mockResolvedValue({ data: { runs: [], overall_stats: {} } });
    const result = await dashboardService.getByProject(3);
    expect(api.get).toHaveBeenCalledWith('/projects/3/dashboard', { params: {} });
    expect(result).toEqual({ runs: [], overall_stats: {} });
  });

  it('getByProject passes params to API', async () => {
    api.get.mockResolvedValue({ data: { runs: [], overall_stats: {} } });
    await dashboardService.getByProject(5, { date: '2025-01-15' });
    expect(api.get).toHaveBeenCalledWith('/projects/5/dashboard', { params: { date: '2025-01-15' } });
  });

  it('getSyncLogs calls GET /sync-logs', async () => {
    api.get.mockResolvedValue({ data: [] });
    const result = await dashboardService.getSyncLogs({ project_id: 1, limit: 10 });
    expect(api.get).toHaveBeenCalledWith('/sync-logs', { params: { project_id: 1, limit: 10 } });
    expect(result).toEqual([]);
  });
});
