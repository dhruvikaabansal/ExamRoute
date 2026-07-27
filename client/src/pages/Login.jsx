import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle, loginWithPassword, register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'otp'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [wasRegister, setWasRegister] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const googleId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const r = await register(form.name, form.email, form.password);
        setOtpEmail(r.email);
        setWasRegister(true);
        setInfo('We emailed you a 6-digit code. (In dev, check the server console.)');
        setMode('otp');
      } else {
        const r = await loginWithPassword(form.email, form.password);
        if (r.needsVerification) {
          setOtpEmail(r.email);
          setWasRegister(false);
          setInfo('Please verify your email — we sent a new code.');
          setMode('otp');
        } else {
          navigate('/exams');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await verifyOtp(otpEmail, otp);
      // new signups go set up their reusable profile; returning users go to exams
      navigate(wasRegister || !u?.homeLocation ? '/profile?welcome=1' : '/exams');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'otp') {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Verify your email</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter the 6-digit code sent to <b>{otpEmail}</b>.
          </p>
          {info && <p className="text-xs text-blue-600 mt-2">{info}</p>}
          <form onSubmit={submitOtp} className="mt-4 space-y-3">
            <input
              className="w-full border rounded p-2 tracking-widest text-center text-lg"
              placeholder="______"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={busy}
              className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>
          <div className="flex justify-between mt-3 text-xs">
            <button
              onClick={async () => {
                await resendOtp(otpEmail);
                setInfo('A new code has been sent.');
              }}
              className="text-brand hover:underline"
            >
              Resend code
            </button>
            <button onClick={() => setMode('login')} className="text-slate-400 hover:underline">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand">🚌 ExamRoute</h1>
        <p className="mt-3 text-slate-600 text-sm">
          Share a bus to your exam center. We pool you with nearby students heading to
          the same center, with an optimized pickup route and departure time.
        </p>
      </div>

      <div className="mt-8 bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex gap-2 mb-4 text-sm">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 rounded ${mode === 'login' ? 'bg-brand text-white' : 'bg-slate-100'}`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 rounded ${mode === 'register' ? 'bg-brand text-white' : 'bg-slate-100'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input
              className="w-full border rounded p-2"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          )}
          <input
            className="w-full border rounded p-2"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="w-full border rounded p-2"
            type="password"
            placeholder="Password (min 6 chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>
        </form>

        {googleId && (
          <>
            <div className="flex items-center gap-3 my-4 text-xs text-slate-400">
              <div className="h-px bg-slate-200 flex-1" /> OR <div className="h-px bg-slate-200 flex-1" />
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={async (cred) => {
                  try {
                    const u = await loginWithGoogle(cred.credential);
                    navigate(u?.homeLocation ? '/exams' : '/profile?welcome=1');
                  } catch {
                    setError('Google login failed');
                  }
                }}
                onError={() => setError('Google login failed')}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
