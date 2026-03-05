import { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authService.getMe()
        .then((data) => setUser(data))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const data = await authService.login(username, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify({ id: data.id, username: data.username }));
    setUser({ id: data.id, username: data.username });
    return data;
  };

  const register = async (username, email, password) => {
    const data = await authService.register(username, email, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify({ id: data.id, username: data.username }));
    setUser({ id: data.id, username: data.username });
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateAvatar = (avatarUrl) => {
    setUser((prev) => prev ? { ...prev, avatar: avatarUrl } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateAvatar, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
