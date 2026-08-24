import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';
import { fmtDate, fmtDateTime, fmtShort } from '../lib/format';

/** Copy-to-clipboard with a graceful fallback for non-secure contexts. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy this link:', text);
    return false;
  }
}

function SeatBar({ used, capacity }) {
  const pct = Math.min(100, Math.round((used / capacity) * 100));
  const over = used > capacity;
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 h-2 bg-slate-200 rounded overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-sm ${over ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
        {used}/{capacity} seats
      </span>
    </div>
  );
}

export default function Admin() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [buses, setBuses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    api.get('/exams').then((res) => {
      setExams(res.data);
      if (res.data[0]) setExamId(res.data[0]._id);
    });
  }, []);

  useEffect(() => {
    if (!examId) return;
    api.get(`/exams/${examId}/sessions`).then((res) => {
      setSessions(res.data);
      setSessionId(res.data[0]?._id || '');
    });
  }, [examId]);

  async function loadSession(id) {
    const [busRes, bookingRes] = await Promise.all([
      api.get(`/admin/buses/${id}`),
      api.get(`/admin/bookings/${id}`),
    ]);
    setBuses(busRes.data);
    setSummary(bookingRes.data.summary);
  }

  useEffect(() => {
    setMsg('');
    setWarnings([]);
    if (sessionId) {
      loadSession(sessionId).catch(() => {
        setBuses([]);
        setSummary(null);
      });
    } else {
      setBuses([]);
      setSummary(null);
    }
  }, [sessionId]);

  async function runRouting() {
    setBusy(true);
    setMsg('');
    setWarnings([]);
    try {
      const res = await api.post(`/admin/route/${sessionId}`);
      setMsg(res.data.message);
      setWarnings(res.data.warnings || []);
      await loadSession(sessionId);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Routing failed');
    } finally {
      setBusy(false);
    }
  }

  async function rotate(busId) {
    const res = await api.post(`/admin/bus/${busId}/rotate-driver-token`);
    setBuses((prev) =>
      prev.map((b) => (b._id === busId ? { ...b, driverToken: res.data.driverToken } : b))
    );
    setCopied('');
  }

  const driverUrl = (bus) => `${window.location.origin}/drive/${bus.driverToken}`;

  return (
    <div>
      <h2 className="page-title mb-5">Admin — Routing</h2>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="label">Exam</label>
          <select
            className="input mt-1"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          >
            {exams.map((e) => (
              <option key={e._id} value={e._id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date &amp; shift</label>
          <select
            className="input mt-1"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s._id} value={s._id}>
                {fmtDate(s.date)} — {s.shiftLabel}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runRouting}
          disabled={busy || !sessionId}
          className="btn-primary"
        >
          {busy ? 'Running…' : 'Run routing engine'}
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            ['Bookings', summary.total],
            ['Paid', summary.paid],
            ['Seats to route', summary.seatsToRoute],
            ['Assigned', summary.assigned],
            ['Boarded', summary.boarded],
          ].map(([label, value]) => (
            <div key={label} className="stat">
              <div className="stat-value">{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/*
        A refund that failed at the gateway is money still owed to a student.
        Cancellation deliberately succeeds even when the refund call fails —
        the seat must be released either way — so the unpaid balance has to
        surface somewhere a human looks, or it is simply lost.
      */}
      {summary?.refundsFailed > 0 && (
        <div className="notice bg-red-50 border-red-200 text-red-700 mb-4">
          {summary.refundsFailed} refund{summary.refundsFailed > 1 ? 's' : ''} failed at
          the gateway — ₹{summary.refundsOwed} still owed. These need settling manually.
        </div>
      )}

      {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}
      {warnings.length > 0 && (
        <ul className="notice bg-amber-50 border-amber-200 text-amber-800 mb-4">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {/*
        An empty list after a run is a real answer, not a blank space — the
        session simply has no paid bookings yet. Saying so beats leaving the
        page looking like it failed to load.
      */}
      {buses.length === 0 && summary && (
        <p className="card-pad muted">
          No buses for this sitting yet. Routing only picks up bookings that are
          already paid — this sitting has {summary.paid} of {summary.total}.
        </p>
      )}

      <div className="space-y-4">
        {buses.map((bus) => {
          /*
            A bus whose arrival time has passed has already run. Its driver
            link and its GPS controls are no longer live actions, and leaving
            them looking identical to tomorrow's buses is how somebody rotates
            a token on the wrong row.
          */
          const completed = new Date(bus.arrivalTime).getTime() < Date.now();
          return (
          <div key={bus._id} className={`card-pad ${completed ? 'opacity-70' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {bus.label}
                {completed && (
                  <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                    trip completed
                  </span>
                )}
                {bus.isOvernight && (
                  <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    overnight
                  </span>
                )}
              </h3>
              <SeatBar used={bus.seatsUsed} capacity={bus.capacity} />
            </div>

            <p className="text-sm text-slate-500 mt-1">
              Departs <b>{fmtDateTime(bus.departureTime)}</b> · arrives{' '}
              <b>{fmtDateTime(bus.arrivalTime)}</b> ({bus.totalDurationMin} min travel)
            </p>

            <ol className="mt-2 text-sm list-decimal list-inside text-slate-600">
              {bus.route.map((stop, i) => (
                <li key={i}>
                  {stop.name} — {fmtShort(stop.pickupTime)}
                </li>
              ))}
            </ol>
            {/*
              The route listed the pickups and simply stopped, so where the bus
              was actually going was never stated — you had to already know.
            */}
            <p className="mt-1 text-sm font-medium text-green-700">
              ⇢ {bus.center?.name || 'Exam centre'} — arrives {fmtShort(bus.arrivalTime)}
            </p>

            <div className="mt-3">
              <MapView
                center={bus.center?.location?.coordinates}
                stops={bus.route}
                route={bus.route}
                height={220}
              />
            </div>

            {/*
              The driver link carries its own authorisation, so it can be sent
              to a driver who has no account at all. Rotating it revokes the
              old one — the recovery path for a link that leaks.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Link to={`/manifest/${bus._id}`} className="btn-dark btn-sm">
                {completed ? 'Who travelled' : 'Boarding list'} →
              </Link>
              {/* Driver controls are live actions; a finished trip has none. */}
              {!completed && (
                <>
                  <a
                    href={driverUrl(bus)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand hover:underline"
                  >
                    Open driver page
                  </a>
                  <button
                    onClick={async () => {
                      await copy(driverUrl(bus));
                      setCopied(bus._id);
                    }}
                    className="btn-outline btn-sm"
                  >
                    {copied === bus._id ? 'Copied' : 'Copy driver link'}
                  </button>
                  <button
                    onClick={() => rotate(bus._id)}
                    className="btn-outline btn-sm"
                    title="Invalidates the current link and issues a new one"
                  >
                    Rotate link
                  </button>
                  <span className="text-xs text-slate-400">no login required</span>
                </>
              )}
            </div>
          </div>
          );
        })}

        {buses.length === 0 && (
          <p className="text-sm text-slate-500">
            No buses yet. Run the routing engine once students have paid for this sitting.
          </p>
        )}
      </div>
    </div>
  );
}
