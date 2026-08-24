import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

/**
 * Session state, and the one way to start one.
 *
 * This used to carry six auth calls: Google, password login, register, verify
 * OTP, resend OTP, and the two halves of a password reset. All of them except
 * Google are gone, because the code they depended on could not be delivered
 * from a free hosting tier and a login form that cannot send its own
 * verification code is a trap rather than a feature.
 *
 * The token lives in localStorage. That is XSS-exposed, and an httpOnly cookie
 * with CSRF protection would be stronger — it is a deliberate trade for a
 * simpler SPA flow, and the honest answer if asked.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('examroute_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('examroute_token'))
      .finally(() => setLoading(false));
  }, []);

  /**
   * Exchange Google's ID token for ours.
   *
   * The credential from Google is not used as the session token. It goes to
   * our server, which verifies the signature and the audience and issues its
   * own JWT — so every route downstream checks one kind of token, and a
   * Google outage cannot invalidate a session already in progress.
   */
  function saveAuth(data) {
    localStorage.setItem('examroute_token', data.token);
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(credential) {
    const res = await api.post('/auth/google', { credential });
    return saveAuth(res.data);
  }

  /**
   * A throwaway student account, for looking around without signing in.
   *
   * Deliberately a separate call rather than a flag on the one above: the two
   * produce very different sessions, and collapsing them would make it easy
   * to end up unsure which kind you are holding.
   */
  async function loginAsDemo() {
    const res = await api.post('/auth/demo');
    return saveAuth(res.data);
  }

  function logout() {
    localStorage.removeItem('examroute_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, loginWithGoogle, loginAsDemo, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
