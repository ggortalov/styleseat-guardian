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
    expect(api.get).toHaveBeenCalledWith('/projects/3/dashboard');
    expect(result).toEqual({ runs: [], overall_stats: {} });
  });
});
