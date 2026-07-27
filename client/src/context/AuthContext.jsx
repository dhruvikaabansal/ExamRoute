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

  // returns { needsVerification: true } if the account isn't email-verified yet
  async function loginWithPassword(email, password) {
    try {
      const res = await api.post('/auth/login', { email, password });
      saveAuth(res.data);
      return { user: res.data.user };
    } catch (err) {
      if (err.response?.status === 403 && err.response.data?.needsVerification)
        return { needsVerification: true, email };
      throw err;
    }
  }

  // register never logs in directly — it triggers an OTP email
  async function register(name, email, password) {
    await api.post('/auth/register', { name, email, password });
    return { needsVerification: true, email };
  }

  async function verifyOtp(email, code) {
    const res = await api.post('/auth/verify-otp', { email, code });
    return saveAuth(res.data);
  }

  async function resendOtp(email) {
    await api.post('/auth/resend-otp', { email });
  }

  function logout() {
    localStorage.removeItem('examroute_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        loginWithPassword,
        register,
        verifyOtp,
        resendOtp,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
