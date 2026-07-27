import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

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

  function saveAuth(data) {
    localStorage.setItem('examroute_token', data.token);
    setUser(data.user);
    return data.user;
  }

  async function loginWithGoogle(credential) {
    const res = await api.post('/auth/google', { credential });
    return saveAuth(res.data);
  }

  async function loginWithPassword(email, password) {
    const res = await api.post('/auth/login', { email, password });
    return saveAuth(res.data);
  }

  async function register(name, email, password) {
    const res = await api.post('/auth/register', { name, email, password });
    return saveAuth(res.data);
  }

  function logout() {
    localStorage.removeItem('examroute_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, loginWithGoogle, loginWithPassword, register, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
