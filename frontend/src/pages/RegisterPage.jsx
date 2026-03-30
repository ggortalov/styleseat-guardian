import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPages.css';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setPasswordErrors([]);
    setLoading(true);
    try {
      await register(username, email, password);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data?.password_errors) {
        setPasswordErrors(data.password_errors);
      } else {
        setError(data?.error || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src={`${import.meta.env.BASE_URL}favicon.jpg`} alt="StyleSeat Regression Guard" className="auth-brand-icon" />
        </div>

        <h2 className="auth-welcome">Create your account</h2>
        <p className="auth-welcome-sub">Get started with test management</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          {passwordErrors.length > 0 && (
            <div className="auth-error auth-error-list">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <div style={{ marginBottom: 6 }}>Password must contain:</div>
                <ul className="auth-pw-requirements">
                  {passwordErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="floating-field">
            <input
              type="text"
              id="reg-username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (error) setError(''); if (passwordErrors.length) setPasswordErrors([]); }}
              placeholder=" "
              required
              autoFocus
            />
            <label htmlFor="reg-username">Username</label>
          </div>

          <div className="floating-field">
            <input
              type="email"
              id="reg-email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(''); if (passwordErrors.length) setPasswordErrors([]); }}
              placeholder=" "
              required
            />
            <label htmlFor="reg-email">Email</label>
          </div>

          <div className="floating-field">
            <input
              type="password"
              id="reg-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(''); if (passwordErrors.length) setPasswordErrors([]); }}
              placeholder=" "
              required
            />
            <label htmlFor="reg-password">Password</label>
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
      <p className="auth-trademark">Designed by StyleSeat</p>
    </div>
  );
}
