import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Login() {
  const { loginWithGoogle, loginWithPassword, register, verifyOtp, resendOtp,
    forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();

  // 'login' | 'register' | 'otp' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const [wasRegister, setWasRegister] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const googleId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  /**
   * Whether codes actually reach an inbox.
   *
   * Without SMTP the server only writes the code to its own log, which a
   * visitor obviously cannot read — so they sit on the verify screen waiting
   * for a message that is never coming. If that is the situation, say it
   * plainly instead of letting them discover it by waiting.
   */
  const [emailWorks, setEmailWorks] = useState(true);
  const [apiAwake, setApiAwake] = useState(false);
  useEffect(() => {
    /*
     * This also wakes the server.
     *
     * The API is on a free tier that sleeps after fifteen minutes idle and
     * takes the better part of a minute to come back. Firing a request the
     * moment the page loads means the wake-up overlaps with the time somebody
     * spends typing, instead of starting when they press the button.
     */
    api
      .get('/health')
      .then((r) => {
        setEmailWorks(r.data?.emailConfigured !== false);
        setApiAwake(true);
      })
      .catch(() => {});
  }, []);

  /*
   * A spinner that sits for fifty seconds is indistinguishable from a hang.
   * If a request is still running after four, say what is happening.
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  const wakingNotice = slow && !apiAwake && (
    <p className="notice bg-amber-50 border-amber-200 text-amber-800 text-xs mt-3">
      Waking the server — this demo runs on a free tier that sleeps when idle, so the
      first request can take up to a minute. It is quick after that.
    </p>
  );

  const noEmailNotice = !emailWorks && (
    <p className="notice bg-amber-50 border-amber-200 text-amber-800 text-xs mt-2">
      Email delivery isn't configured on this deployment, so the code won't reach your
      inbox. {googleId ? 'Use “Continue with Google” instead.' : 'Ask the operator for the code.'}
    </p>
  );

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

  /**
   * Ask for a reset code.
   *
   * The server answers identically whether or not the account exists, so this
   * screen must not imply otherwise — "if an account exists" is the honest
   * wording, and anything more specific would leak which emails are
   * registered to anyone who cares to ask.
   */
  async function submitForgot(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const message = await forgotPassword(form.email);
      setOtpEmail(form.email);
      setInfo(message);
      setMode('reset');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send a reset code');
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Signs them straight in — no reason to make somebody who just proved
      // control of their mailbox log in again.
      const u = await resetPassword(otpEmail, otp, form.password);
      navigate(u?.homeLocation ? '/exams' : '/profile?welcome=1');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset your password');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Reset your password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter your email and we'll send a 6-digit code.
          </p>
          {noEmailNotice}
          <form onSubmit={submitForgot} className="mt-4 space-y-3">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
            {wakingNotice}
          </form>
          <button
            onClick={() => { setMode('login'); setError(''); setInfo(''); }}
            className="mt-3 text-xs text-slate-400 hover:underline"
          >
            Back to log in
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'reset') {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Choose a new password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter the code sent to <b>{otpEmail}</b> and a new password.
          </p>
          {info && <p className="text-xs text-blue-600 mt-2">{info}</p>}
          {noEmailNotice}
          <form onSubmit={submitReset} className="mt-4 space-y-3">
            <div>
              <label className="label">6-digit code</label>
              <input
                className="input tracking-[0.5em] text-center text-lg"
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            <div>
              <label className="label">New password</label>
              <input
                className="input"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>
            {wakingNotice}
          </form>
          <button
            onClick={() => { setMode('forgot'); setError(''); setOtp(''); }}
            className="mt-3 text-xs text-slate-400 hover:underline"
          >
            Send another code
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'otp') {
    return (
      <div className="max-w-sm mx-auto mt-20">
        <div className="card p-6">
          <h2 className="text-lg font-semibold">Verify your email</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter the 6-digit code sent to <b>{otpEmail}</b>.
          </p>
          {info && <p className="text-xs text-blue-600 mt-2">{info}</p>}
          {noEmailNotice}
          <form onSubmit={submitOtp} className="mt-4 space-y-3">
            <div>
              <label className="label">6-digit code</label>
              <input
                className="input tracking-[0.5em] text-center text-lg"
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            {wakingNotice}
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
    /*
      Two columns rather than a hero with a card dropped over its edge.
      The old shape left half the screen empty beside the headline and put a
      hard seam through the middle of the form. A split screen fills both
      halves, keeps the pitch and the action side by side, and collapses to a
      single stack on a phone without any of it needing to move.
    */
    <div className="-mx-4 -mt-6 min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="bg-brand-soft/40 px-6 py-14 lg:px-14 flex items-center">
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <div className="flex items-center gap-2 mb-8">
            <span className="font-bold text-xl tracking-tight text-brand">ExamRoute</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold leading-[1.15] text-slate-900">
            Share a bus to your exam centre
          </h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            We pool you with students near you heading to the same centre, find your
            nearest pickup stop, and time the departure backwards from when the gate
            closes.
          </p>

          <ul className="mt-8 space-y-4">
            {[
              ['Pickup near home', 'Matched to the nearest stop in your area.'],
              ['Fares that fall with distance', 'The furthest journeys get the largest subsidy.'],
              ['Live bus tracking', 'Watch it move on the morning of the exam.'],
            ].map(([title, detail]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="text-sm text-slate-500">{detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="px-4 py-14 flex items-center justify-center">
        <div className="w-full max-w-sm">
      <div className="card p-6">
        <div className="flex gap-1 mb-5 text-sm bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => { setMode('login'); setError(''); setInfo(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'login' ? 'bg-white text-brand-dark shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Log in
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); setInfo(''); }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'register' ? 'bg-white text-brand-dark shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>
            {wakingNotice}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
              className="w-full text-center text-sm text-brand hover:underline"
            >
              Forgot your password?
            </button>
          )}
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

        <p className="text-center text-xs text-slate-400 mt-5">
          Built for students sitting JEE, NEET, CUET and Rajasthan state exams.
        </p>
        </div>
      </div>
    </div>
  );
}
