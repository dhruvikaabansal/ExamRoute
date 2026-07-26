import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Admin() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [buses, setBuses] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/exams').then((res) => {
      setExams(res.data);
      if (res.data[0]) setExamId(res.data[0]._id);
    });
  }, []);

  async function loadBuses(id) {
    const res = await api.get(`/admin/buses/${id}`);
    setBuses(res.data);
  }

  useEffect(() => {
    if (examId) loadBuses(examId).catch(() => setBuses([]));
  }, [examId]);

  async function runRouting() {
    setBusy(true);
    setMsg('');
    try {
      const res = await api.post(`/admin/route/${examId}`);
      setMsg(res.data.message);
      await loadBuses(examId);
    } catch (err) {
      setMsg(err.response?.data?.message || 'Routing failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Admin — Routing</h2>

      <div className="flex items-end gap-3 mb-4">
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
        <button
          onClick={runRouting}
          disabled={busy}
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
                Departs{' '}
                {bus.departureTime &&
                  new Date(bus.departureTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                · {bus.passengers.length} students
              </span>
            </div>
            <ol className="mt-2 text-sm list-decimal list-inside text-slate-600">
              {bus.route.map((stop, i) => (
                <li key={i}>
                  {stop.name} —{' '}
                  {stop.pickupTime &&
                    new Date(stop.pickupTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </li>
              ))}
            </ol>
          </div>
        ))}
        {buses.length === 0 && (
          <p className="text-sm text-slate-500">
            No buses yet. Run the routing engine after students have paid.
          </p>
        )}
      </div>
    </div>
  );
}
