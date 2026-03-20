import { describe, it, expect, vi, beforeEach } from 'vitest';
import projectService from './projectService';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('projectService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll calls GET /projects', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1 }] });
    const result = await projectService.getAll();
    expect(api.get).toHaveBeenCalledWith('/projects');
    expect(result).toEqual([{ id: 1 }]);
  });

  it('getById calls GET /projects/:id', async () => {
    api.get.mockResolvedValue({ data: { id: 1, name: 'Test' } });
    const result = await projectService.getById(1);
    expect(api.get).toHaveBeenCalledWith('/projects/1');
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  it('create calls POST /projects', async () => {
    api.post.mockResolvedValue({ data: { id: 2, name: 'New' } });
    const result = await projectService.create({ name: 'New' });
    expect(api.post).toHaveBeenCalledWith('/projects', { name: 'New' });
    expect(result).toEqual({ id: 2, name: 'New' });
  });

  it('update calls PUT /projects/:id', async () => {
    api.put.mockResolvedValue({ data: { id: 1, name: 'Updated' } });
    const result = await projectService.update(1, { name: 'Updated' });
    expect(api.put).toHaveBeenCalledWith('/projects/1', { name: 'Updated' });
    expect(result).toEqual({ id: 1, name: 'Updated' });
  });

  it('delete calls DELETE /projects/:id', async () => {
    api.delete.mockResolvedValue({ data: { message: 'ok' } });
    const result = await projectService.delete(1);
    expect(api.delete).toHaveBeenCalledWith('/projects/1');
    expect(result).toEqual({ message: 'ok' });
  });

  it('getStats calls GET /projects/:id/stats', async () => {
    api.get.mockResolvedValue({ data: { Passed: 10 } });
    const result = await projectService.getStats(1);
    expect(api.get).toHaveBeenCalledWith('/projects/1/stats');
    expect(result).toEqual({ Passed: 10 });
  });
});
