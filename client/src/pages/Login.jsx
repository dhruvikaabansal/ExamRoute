import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

/**
 * One way in.
 *
 * This screen used to hold five modes — log in, sign up, verify a code, forget
 * a password, reset it — and a tab bar to move between them. The email half is
 * gone, and with it every state that existed only to recover from the email
 * half going wrong.
 *
 * The reason was delivery, not preference. Free hosting tiers block outbound
 * SMTP, and HTTP mail services will not send to strangers from an unverified
 * sender, so the verification code was generated, hashed, stored, and then
 * never arrived. A sign-up form whose confirmation cannot reach the person who
 * filled it in is worse than no sign-up form: it takes their details and gives
 * them a screen to wait on.
 *
 * Google verifies the address, holds the password and handles recovery. What
 * is left is a single button that works, which is the honest shape of this
 * screen rather than a reduced version of it.
 */
export default function Login() {
  const { loginWithGoogle, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiAwake, setApiAwake] = useState(false);

  const googleId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    /*
      This wakes the server as much as it checks it.

      The API is on a free tier that sleeps after fifteen minutes idle and
      takes the better part of a minute to come back. Firing a request the
      moment the page loads means the wake-up overlaps with the time somebody
      spends reading, instead of starting when they press the button.
    */
    api
      .get('/health')
      .then(() => setApiAwake(true))
      .catch(() => {});
  }, []);

  /*
    A spinner that sits for fifty seconds is indistinguishable from a hang.
    If sign-in is still running after four, say what is happening.
  */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, [busy]);

  /** Both sign-in paths land in the same place, so they share the ending. */
  async function enter(getUser, failureMessage) {
    setError('');
    setBusy(true);
    try {
      const user = await getUser();
      // Straight to booking if we already know where they live; otherwise
      // collect that first, since every fare and pickup depends on it.
      navigate(user?.homeLocation ? '/exams' : '/profile?welcome=1');
    } catch (err) {
      setError(err.response?.data?.message || failureMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
      Two columns rather than a hero with a card dropped over its edge. The old
      shape left half the screen empty beside the headline and put a hard seam
      through the middle of the form. A split screen fills both halves, keeps
      the pitch and the action side by side, and collapses to a single stack on
      a phone without any of it needing to move.
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
          <div className="card p-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900">Sign in to book</h2>
            <p className="muted mt-2">
              We use your Google account, so there is no extra password to remember
              and nothing to reset if you forget one.
            </p>

            {googleId ? (
              <div className="flex justify-center mt-7">
                <GoogleLogin
                  onSuccess={(cred) =>
                    enter(
                      () => loginWithGoogle(cred.credential),
                      'Could not sign you in with Google. Please try again.'
                    )
                  }
                  onError={() => setError('Google sign-in failed. Please try again.')}
                  useOneTap={false}
                />
              </div>
            ) : (
              /*
                Without a client id the button will not render at all, which
                looks like a broken page rather than a missing setting. Say
                which setting, because the person seeing this is almost
                certainly the one who can fix it.
              */
              <p className="notice bg-amber-50 border-amber-200 text-amber-800 mt-6 text-left">
                Google sign-in is not configured on this deployment.
                Set <code className="font-mono text-xs">VITE_GOOGLE_CLIENT_ID</code> in
                the frontend environment and redeploy.
              </p>
            )}

            {/*
              The second way in, and for most people who land here the better
              one. Anyone opening this is probably evaluating it, and asking a
              stranger for their Google account before showing them anything
              is a real cost — the ones who decline never reach the routing
              engine, which is the part worth seeing.

              Quieter than the Google button on purpose: it is the shortcut,
              not the way an actual student would sign in.
            */}
            <div className="flex items-center gap-3 my-6 text-xs text-slate-400">
              <div className="h-px bg-slate-200 flex-1" />
              or
              <div className="h-px bg-slate-200 flex-1" />
            </div>

            <button
              onClick={() =>
                enter(loginAsDemo, 'Could not start a demo session. Please try again.')
              }
              disabled={busy}
              className="btn-outline w-full"
            >
              Explore with a guest account
            </button>
            <p className="text-xs text-slate-400 mt-2">
              No sign-up. You get a fresh empty account to book a seat and look around.
            </p>

            {busy && <p className="muted mt-5">Signing you in…</p>}

            {slow && !apiAwake && (
              <p className="notice bg-amber-50 border-amber-200 text-amber-800 text-xs mt-4 text-left">
                Waking the server — this demo runs on a free tier that sleeps when
                idle, so the first request can take up to a minute. It is quick after
                that.
              </p>
            )}

            {error && (
              <p className="notice bg-red-50 border-red-200 text-red-700 text-sm mt-4 text-left">
                {error}
              </p>
            )}

            <p className="text-xs text-slate-400 mt-7 leading-relaxed">
              We read your name, email and profile picture — nothing else, and we
              never see your Google password.
            </p>
          </div>

          <p className="text-center text-xs text-slate-400 mt-5">
            Built for students sitting JEE, NEET, CUET and Rajasthan state exams.
          </p>
        </div>
      </div>
    </div>
  );
}
