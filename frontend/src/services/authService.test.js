import { describe, it, expect, vi, beforeEach } from 'vitest';
import authService from './authService';
import api from './api';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('authService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('login calls POST /auth/login with credentials', async () => {
    api.post.mockResolvedValue({ data: { id: 1, username: 'demo', token: 'abc' } });
    const result = await authService.login('demo', 'Demo1234');
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'demo', password: 'Demo1234' });
    expect(result).toEqual({ id: 1, username: 'demo', token: 'abc' });
  });

  it('register calls POST /auth/register with user data', async () => {
    api.post.mockResolvedValue({ data: { id: 2, username: 'new', token: 'xyz' } });
    const result = await authService.register('new', 'new@styleseat.com', 'Pass1234');
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      username: 'new',
      email: 'new@styleseat.com',
      password: 'Pass1234',
    });
    expect(result).toEqual({ id: 2, username: 'new', token: 'xyz' });
  });

  it('logout calls POST /auth/logout', async () => {
    api.post.mockResolvedValue({ data: { message: 'ok' } });
    const result = await authService.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(result).toEqual({ message: 'ok' });
  });

  it('getMe calls GET /auth/me', async () => {
    api.get.mockResolvedValue({ data: { id: 1, username: 'demo' } });
    const result = await authService.getMe();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(result).toEqual({ id: 1, username: 'demo' });
  });

  it('uploadAvatar calls POST /auth/avatar with FormData', async () => {
    const file = new File(['pixels'], 'photo.png', { type: 'image/png' });
    api.post.mockResolvedValue({ data: { avatar: '/api/auth/avatars/uuid.png' } });

    const result = await authService.uploadAvatar(file);

    expect(api.post).toHaveBeenCalledWith(
      '/auth/avatar',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    expect(result).toEqual({ avatar: '/api/auth/avatars/uuid.png' });

    // Verify the FormData contains the file
    const formData = api.post.mock.calls[0][1];
    expect(formData.get('file')).toBe(file);
  });
});
