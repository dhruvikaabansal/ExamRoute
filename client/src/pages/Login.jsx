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
  useEffect(() => {
    api
      .get('/health')
      .then((r) => setEmailWorks(r.data?.emailConfigured !== false))
      .catch(() => {});
  }, []);

  const noEmailNotice = !emailWorks && (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
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
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Reset your password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter your email and we'll send a 6-digit code.
          </p>
          {noEmailNotice}
          <form onSubmit={submitForgot} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                className="w-full border rounded p-2"
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
              className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reset code'}
            </button>
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
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Choose a new password</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter the code sent to <b>{otpEmail}</b> and a new password.
          </p>
          {info && <p className="text-xs text-blue-600 mt-2">{info}</p>}
          {noEmailNotice}
          <form onSubmit={submitReset} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">6-digit code</label>
              <input
                className="w-full border rounded p-2 tracking-[0.5em] text-center text-lg"
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
              <label className="block text-sm font-medium mb-1">New password</label>
              <input
                className="w-full border rounded p-2"
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
              className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>
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
      <div className="max-w-md mx-auto mt-16">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Verify your email</h2>
          <p className="text-sm text-slate-500 mt-1">
            Enter the 6-digit code sent to <b>{otpEmail}</b>.
          </p>
          {info && <p className="text-xs text-blue-600 mt-2">{info}</p>}
          {noEmailNotice}
          <form onSubmit={submitOtp} className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">6-digit code</label>
              <input
                className="w-full border rounded p-2 tracking-[0.5em] text-center text-lg"
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
    <div className="-mx-4 -mt-6">
      {/*
        Hero, then the card lifted over its lower edge — the shape every travel
        booking site uses, and for a reason: it puts the promise and the action
        in one glance instead of making you scroll to find the form.
      */}
      {/*
        A pale tint rather than a saturated slab. The brand colour is worth
        more when it is spent on the one thing you want pressed — everything
        here is dark text on near-white, which is how the booking sites this
        borrows from actually look.
      */}
      <div className="bg-brand-soft/50 border-b border-brand-soft px-4 pt-12 pb-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 max-w-2xl">
            Share a bus to your exam centre
          </h1>
          <p className="mt-3 text-slate-600 max-w-xl leading-relaxed">
            We pool you with students near you heading to the same centre, find your
            nearest pickup stop, and time the departure backwards from when the gate
            closes.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span>Pickup near home</span>
            <span>Fares subsidised by distance</span>
            <span>Live bus tracking</span>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-8 relative pb-12">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex gap-2 mb-4 text-sm">
          <button
            onClick={() => { setMode('login'); setError(''); setInfo(''); }}
            className={`flex-1 py-2 rounded-lg text-sm transition ${mode === 'login' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Log in
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); setInfo(''); }}
            className={`flex-1 py-2 rounded-lg text-sm transition ${mode === 'register' ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium mb-1">Full name</label>
              <input
                className="w-full border rounded p-2"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              className="w-full border rounded p-2"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              className="w-full border rounded p-2"
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
            className="w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
          </button>

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

        <p className="text-center text-xs text-slate-400 mt-4">
          Built for students sitting JEE, NEET, CUET and Rajasthan state exams.
        </p>
      </div>
    </div>
  );
}
