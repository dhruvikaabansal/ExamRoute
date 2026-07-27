import { useEffect, useState } from 'react';
import api from '../api/client';

const fmtDate = (d) =>
  new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDateTime = (d) =>
  new Date(d).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function Admin() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [buses, setBuses] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

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

  async function loadBuses(id) {
    const res = await api.get(`/admin/buses/${id}`);
    setBuses(res.data);
  }

  useEffect(() => {
    if (sessionId) loadBuses(sessionId).catch(() => setBuses([]));
    else setBuses([]);
  }, [sessionId]);

  async function runRouting() {
    setBusy(true);
    setMsg('');
    try {
      const res = await api.post(`/admin/route/${sessionId}`);
      setMsg(res.data.message);
      await loadBuses(sessionId);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Routing failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Admin — Routing</h2>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium">Exam</label>
          <select
            className="border rounded p-2 mt-1"
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
          >
            {exams.map((e) => (
              <option key={e._id} value={e._id}>{e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Date &amp; shift</label>
          <select
            className="border rounded p-2 mt-1"
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
          className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Running…' : 'Run routing engine'}
        </button>
      </div>

      {msg && <p className="text-sm text-green-700 mb-4">{msg}</p>}

      <div className="space-y-4">
        {buses.map((bus) => (
          <div key={bus._id} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{bus.label}</h3>
              <span className="text-sm text-slate-500">
                {bus.seatsUsed}/{bus.capacity} seats · departs {fmtDateTime(bus.departureTime)}
              </span>
            </div>
            <ol className="mt-2 text-sm list-decimal list-inside text-slate-600">
              {bus.route.map((stop, i) => (
                <li key={i}>
                  {stop.name} — {fmtDateTime(stop.pickupTime)}
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-500 mt-2">
              Arrives at center by {fmtDateTime(bus.arrivalTime)} ({bus.totalDurationMin} min travel)
            </p>
          </div>
        ))}
        {buses.length === 0 && (
          <p className="text-sm text-slate-500">
            No buses yet. Run the routing engine after students have paid for this session.
          </p>
        )}
      </div>
    </div>
  );
}
