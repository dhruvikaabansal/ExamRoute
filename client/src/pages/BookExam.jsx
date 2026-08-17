import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { payBooking } from '../lib/pay';
import LocationPicker from '../components/LocationPicker';
import { fmtDate, fmtTime } from '../lib/format';

// A few Rajasthan home presets so the demo has sensible distances
const PRESETS = [
  { label: 'Kota', c: [75.8648, 25.2138] },
  { label: 'Sikar', c: [75.1398, 27.6094] },
  { label: 'Bhilwara', c: [74.6313, 25.3407] },
  { label: 'Alwar', c: [76.61, 27.553] },
  { label: 'Bikaner', c: [73.3119, 28.0229] },
];

export default function BookExam() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exam, setExam] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [centers, setCenters] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [centerId, setCenterId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [companions, setCompanions] = useState(0);
  const [coords, setCoords] = useState({
    lat: user?.homeLocation?.coordinates?.[1] || '',
    lng: user?.homeLocation?.coordinates?.[0] || '',
  });
  const [address, setAddress] = useState(user?.homeLocation?.address || '');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/exams/${examId}`).then((r) => setExam(r.data));
    api.get(`/exams/${examId}/sessions`).then((r) => {
      setSessions(r.data);
      if (r.data[0]) setSessionId(r.data[0]._id);
    });
    api.get(`/exams/${examId}/centers`).then((r) => {
      setCenters(r.data);
      if (r.data[0]) setCenterId(r.data[0]._id);
    });
  }, [examId]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert('Could not get location. Enter it manually.')
    );
  }

  async function getQuote() {
    if (!centerId || !coords.lat || !coords.lng) return alert('Pick a center and location');
    const res = await api.post('/bookings/quote', {
      centerId,
      coordinates: [Number(coords.lng), Number(coords.lat)],
      companions: Number(companions),
    });
    setQuote(res.data);
  }

  async function bookAndPay() {
    setBusy(true);
    try {
      const bookingRes = await api.post('/bookings', {
        examId,
        sessionId,
        centerId,
        rollNumber,
        coordinates: [Number(coords.lng), Number(coords.lat)],
        address,
        companions: Number(companions),
      });
      const booking = bookingRes.data;

      await payBooking(booking._id, user);
      navigate(`/booking/${booking._id}/confirmed`);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const selectedSession = sessions.find((s) => s._id === sessionId);

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold mb-1">Book your seat</h2>
      {exam && <p className="text-sm text-slate-500 mb-4">{exam.name}</p>}

      <label className="block text-sm font-medium">Date &amp; shift</label>
      <select
        className="w-full border rounded p-2 mt-1 mb-1"
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
      >
        {sessions.map((s) => (
          <option key={s._id} value={s._id}>
            {fmtDate(s.date)} — {s.shiftLabel}
            {s.subject ? ` · ${s.subject}` : ''}
          </option>
        ))}
      </select>
      {selectedSession && (
        <p className="text-xs text-slate-500 mb-4">
          Exam starts {fmtTime(selectedSession.examStart)} · gate closes{' '}
          <b>{fmtTime(selectedSession.gateClose)}</b> — the bus is timed to arrive before this.
        </p>
      )}

      <label className="block text-sm font-medium">Exam center</label>
      <select
        className="w-full border rounded p-2 mt-1 mb-4"
        value={centerId}
        onChange={(e) => setCenterId(e.target.value)}
      >
        {centers.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name} — {c.city}
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium">
        Your roll / application number for this exam
      </label>
      <input
        className="w-full border rounded p-2 mt-1 mb-4"
        placeholder="e.g. 2601000123 (from your admit card)"
        value={rollNumber}
        onChange={(e) => setRollNumber(e.target.value)}
      />

      <label className="block text-sm font-medium">Seats for parents / guardians</label>
      <select
        className="w-full border rounded p-2 mt-1 mb-4"
        value={companions}
        onChange={(e) => {
          setCompanions(Number(e.target.value));
          setQuote(null);
        }}
      >
        <option value={0}>Just me (1 seat)</option>
        <option value={1}>+1 companion (2 seats)</option>
        <option value={2}>+2 companions (3 seats)</option>
        <option value={3}>+3 companions (4 seats)</option>
      </select>

      <label className="block text-sm font-medium">Your home location</label>
      <p className="text-xs text-slate-400 mb-1">Tap on the map to drop your home pin.</p>
      <LocationPicker
        lat={coords.lat}
        lng={coords.lng}
        onChange={(lat, lng) => {
          setCoords({ lat, lng });
          setQuote(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button onClick={useMyLocation} className="text-sm text-brand hover:underline">
          📍 Use my current location
        </button>
        <span className="text-xs text-slate-400">or jump to a city:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setCoords({ lat: p.c[1], lng: p.c[0] });
              setAddress(p.label);
              setQuote(null);
            }}
            className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
          >
            {p.label}
          </button>
        ))}
      </div>
      <input
        className="border rounded p-2 w-full mt-3"
        placeholder="Address (optional)"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <button
        onClick={getQuote}
        className="mt-4 bg-slate-200 px-4 py-2 rounded text-sm hover:bg-slate-300"
      >
        Get fare estimate
      </button>

      {quote && (
        <div className="mt-4 bg-white border rounded p-4 text-sm space-y-1">
          <p>Distance to center: <b>{quote.distanceKm} km</b></p>
          <p>Seats: <b>{quote.seats}</b> · Base fare: <b>₹{quote.baseFare}</b></p>
          <p className="text-green-700">
            Subsidy for your distance: <b>{quote.subsidyPercent}%</b>
          </p>
          <p className="text-lg">You pay: <b>₹{quote.fare}</b></p>
          <button
            onClick={bookAndPay}
            disabled={busy}
            className="mt-2 bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Processing…' : `Pay ₹${quote.fare} & book`}
          </button>
        </div>
      )}
    </div>
  );
}
