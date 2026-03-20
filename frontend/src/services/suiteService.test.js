import { describe, it, expect, vi, beforeEach } from 'vitest';
import suiteService from './suiteService';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('suiteService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getByProject calls GET /projects/:pid/suites', async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, name: 'Suite A' }] });
    const result = await suiteService.getByProject(5);
    expect(api.get).toHaveBeenCalledWith('/projects/5/suites');
    expect(result).toEqual([{ id: 1, name: 'Suite A' }]);
  });

  it('getById calls GET /suites/:id', async () => {
    api.get.mockResolvedValue({ data: { id: 3, name: 'Suite C' } });
    const result = await suiteService.getById(3);
    expect(api.get).toHaveBeenCalledWith('/suites/3');
    expect(result).toEqual({ id: 3, name: 'Suite C' });
  });

  it('create calls POST /projects/:pid/suites', async () => {
    api.post.mockResolvedValue({ data: { id: 10, name: 'New Suite' } });
    const result = await suiteService.create(2, { name: 'New Suite' });
    expect(api.post).toHaveBeenCalledWith('/projects/2/suites', { name: 'New Suite' });
    expect(result).toEqual({ id: 10, name: 'New Suite' });
  });

  it('update calls PUT /suites/:id', async () => {
    api.put.mockResolvedValue({ data: { id: 3, name: 'Renamed' } });
    const result = await suiteService.update(3, { name: 'Renamed' });
    expect(api.put).toHaveBeenCalledWith('/suites/3', { name: 'Renamed' });
    expect(result).toEqual({ id: 3, name: 'Renamed' });
  });

  it('delete calls DELETE /suites/:id', async () => {
    api.delete.mockResolvedValue({ data: { message: 'deleted' } });
    const result = await suiteService.delete(3);
    expect(api.delete).toHaveBeenCalledWith('/suites/3');
    expect(result).toEqual({ message: 'deleted' });
  });
});
