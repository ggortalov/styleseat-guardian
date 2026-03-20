import { describe, it, expect, vi, beforeEach } from 'vitest';
import runService from './runService';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('runService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getAll', () => {
    it('calls GET /runs without params by default', async () => {
      api.get.mockResolvedValue({ data: { items: [] } });
      const result = await runService.getAll();
      expect(api.get).toHaveBeenCalledWith('/runs', { params: {} });
      expect(result).toEqual({ items: [] });
    });

    it('passes limit and offset as query params', async () => {
      api.get.mockResolvedValue({ data: { items: [{ id: 1 }] } });
      await runService.getAll({ limit: 10, offset: 20 });
      expect(api.get).toHaveBeenCalledWith('/runs', { params: { limit: 10, offset: 20 } });
    });

    it('omits null params', async () => {
      api.get.mockResolvedValue({ data: { items: [] } });
      await runService.getAll({ limit: 5 });
      expect(api.get).toHaveBeenCalledWith('/runs', { params: { limit: 5 } });
    });
  });

  it('getByProject calls GET /projects/:pid/runs', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1 }] });
    const result = await runService.getByProject(7);
    expect(api.get).toHaveBeenCalledWith('/projects/7/runs');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('getById calls GET /runs/:id', async () => {
    api.get.mockResolvedValue({ data: { id: 1, name: 'Run A' } });
    const result = await runService.getById(1);
    expect(api.get).toHaveBeenCalledWith('/runs/1');
    expect(result).toEqual({ id: 1, name: 'Run A' });
  });

  it('create calls POST /projects/:pid/runs', async () => {
    api.post.mockResolvedValue({ data: { id: 5 } });
    const result = await runService.create(3, { name: 'New Run', suite_id: 1 });
    expect(api.post).toHaveBeenCalledWith('/projects/3/runs', { name: 'New Run', suite_id: 1 });
    expect(result).toEqual({ id: 5 });
  });

  it('update calls PUT /runs/:id', async () => {
    api.put.mockResolvedValue({ data: { id: 1, is_completed: true } });
    const result = await runService.update(1, { is_completed: true });
    expect(api.put).toHaveBeenCalledWith('/runs/1', { is_completed: true });
    expect(result).toEqual({ id: 1, is_completed: true });
  });

  it('delete calls DELETE /runs/:id', async () => {
    api.delete.mockResolvedValue({ data: { message: 'ok' } });
    const result = await runService.delete(1);
    expect(api.delete).toHaveBeenCalledWith('/runs/1');
    expect(result).toEqual({ message: 'ok' });
  });

  it('getResults calls GET /runs/:id/results', async () => {
    api.get.mockResolvedValue({ data: [{ id: 10 }] });
    const result = await runService.getResults(1);
    expect(api.get).toHaveBeenCalledWith('/runs/1/results');
    expect(result).toEqual([{ id: 10 }]);
  });

  it('getResult calls GET /results/:id', async () => {
    api.get.mockResolvedValue({ data: { id: 10, status: 'Passed' } });
    const result = await runService.getResult(10);
    expect(api.get).toHaveBeenCalledWith('/results/10');
    expect(result).toEqual({ id: 10, status: 'Passed' });
  });

  it('updateResult calls PUT /results/:id', async () => {
    api.put.mockResolvedValue({ data: { id: 10, status: 'Failed' } });
    const result = await runService.updateResult(10, { status: 'Failed' });
    expect(api.put).toHaveBeenCalledWith('/results/10', { status: 'Failed' });
    expect(result).toEqual({ id: 10, status: 'Failed' });
  });

  it('getResultHistory calls GET /results/:id/history', async () => {
    api.get.mockResolvedValue({ data: [{ status: 'Passed' }] });
    const result = await runService.getResultHistory(10);
    expect(api.get).toHaveBeenCalledWith('/results/10/history');
    expect(result).toEqual([{ status: 'Passed' }]);
  });
});
