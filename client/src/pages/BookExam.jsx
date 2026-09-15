import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { payBooking } from '../lib/pay';
import LocationPicker from '../components/LocationPicker';
import AddressSearch, { reverseGeocode } from '../components/AddressSearch';
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
  // Only complain once they have actually left the field — flagging an empty
  // input as invalid before it has been touched is nagging, not helping.
  const [rollTouched, setRollTouched] = useState(false);
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

  /**
   * The pin is what the fare is computed from, so whenever it moves we look
   * up the real address and rewrite the text to match. Letting the two
   * disagree would mean showing a student one address and charging them for
   * the distance to another.
   */
  async function pinMoved(lat, lng) {
    setCoords({ lat, lng });
    setQuote(null);
    try {
      const found = await reverseGeocode(lat, lng);
      if (found) setAddress(found);
    } catch {
      // Non-fatal: the coordinates are what get sent.
    }
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => pinMoved(pos.coords.latitude, pos.coords.longitude),
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

  /**
   * The same rule the server enforces, checked before the request.
   *
   * Not a substitute for the server check — the client is not trusted — but
   * being told your roll number is missing after a payment attempt is a poor
   * way to learn it.
   */
  function rollNumberProblem() {
    const roll = rollNumber.trim().toUpperCase();
    if (!roll) return 'Enter your exam application / roll number.';
    if (roll.length < 6 || roll.length > 24)
      return 'Application / roll number should be 6 to 24 characters.';
    if (!/^[A-Z0-9-]+$/.test(roll))
      return 'Application / roll number can only contain letters, numbers and hyphens.';
    return '';
  }

  async function bookAndPay() {
    const problem = rollNumberProblem();
    if (problem) return alert(problem);
    if (!coords.lat || !coords.lng) return alert('Drop your home pin on the map first.');

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
      /*
        Cancelling the payment sheet is not an error, it is a decision. The
        seat is held unpaid either way, so say that rather than showing the
        raw failure — "Payment cancelled" as a red alert reads like something
        broke, and the student needs to know the booking is still waiting for
        them rather than lost.
      */
      if (err.message === 'Payment cancelled') {
        alert(
          'Payment cancelled. Your seat is held unpaid — finish paying here, or ' +
            'from My Bookings whenever you are ready.'
        );
      } else {
        alert(err.response?.data?.message || err.message || 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedSession = sessions.find((s) => s._id === sessionId);

  return (
    <div className="page-mid">
      <h2 className="page-title mb-1">Book your seat</h2>
      {exam && <p className="text-sm text-slate-500 mb-4">{exam.name}</p>}

      <label className="label">Date &amp; shift</label>
      <select
        className="input mt-1 mb-1"
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

      <label className="label">Exam center</label>
      <select
        className="input mt-1 mb-4"
        value={centerId}
        onChange={(e) => setCenterId(e.target.value)}
      >
        {centers.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name} — {c.city}
          </option>
        ))}
      </select>

      <label className="label">
        Your roll / application number for this exam <span className="text-red-600">*</span>
      </label>
      <p className="text-xs text-slate-400 mt-0.5">
        Required. It is checked against your admit card when you board, so it
        has to match. Each exam issues its own number.
      </p>
      <input
        className={`input mt-1 ${
          rollTouched && rollNumberProblem() ? 'border-red-400 mb-1' : 'mb-4'
        }`}
        placeholder="e.g. 2601000123 (from your admit card)"
        value={rollNumber}
        onBlur={() => setRollTouched(true)}
        onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
      />
      {rollTouched && rollNumberProblem() && (
        <p className="text-xs text-red-600 mb-4">{rollNumberProblem()}</p>
      )}

      <label className="label">Seats for parents / guardians</label>
      <select
        className="input mt-1 mb-4"
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

      <label className="label">Your home location</label>
      <p className="text-xs text-slate-400 mb-1">
        Search your address, or tap the map to drop the pin. Your fare is calculated
        from this point, so it is worth getting right.
      </p>
      <AddressSearch
        value={address}
        onChange={setAddress}
        onPick={(lat, lng) => {
          setCoords({ lat, lng });
          setQuote(null);
        }}
      />
      <div className="mt-2">
        <LocationPicker lat={coords.lat} lng={coords.lng} onChange={pinMoved} />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button onClick={useMyLocation} className="text-sm text-brand hover:underline">
          Use my current location
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
            className="btn-outline btn-sm"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/*
        The fare is quoted before it is charged, deliberately. Distance-based
        pricing is only fair if you can see the distance it was based on.
      */}
      <button onClick={getQuote} className="btn-outline mt-5">
        Get fare estimate
      </button>

      {quote ? (
        <div className="card p-6 mt-4 text-sm">
          <div className="space-y-1.5">
            {/*
              Name the leg being charged for. "Distance to the centre" was
              ambiguous between two different numbers, and the one it showed
              was not the one being billed.
            */}
            <p className="flex justify-between">
              <span className="text-slate-500">
                {quote.boardingStop ? `Bus journey from ${quote.boardingStop}` : 'Bus journey'}
              </span>
              <b>{quote.distanceKm} km</b>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Seats</span>
              <b>{quote.seats}</b>
            </p>
            <p className="flex justify-between">
              <span className="text-slate-500">Base fare</span>
              <b>₹{quote.baseFare}</b>
            </p>
            <p className="flex justify-between text-green-700">
              <span>
                Subsidy
                {quote.homeDistanceKm != null && ` — you live ${quote.homeDistanceKm} km away`}
              </span>
              <b>{quote.subsidyPercent}%</b>
            </p>
          </div>
          <p className="flex justify-between items-baseline border-t border-slate-100 mt-3 pt-3">
            <span className="font-medium">You pay</span>
            <b className="text-xl">₹{quote.fare}</b>
          </p>
          <button onClick={bookAndPay} disabled={busy} className="btn-primary w-full mt-4">
            {busy ? 'Processing…' : `Pay ₹${quote.fare} and book →`}
          </button>
          <p className="text-xs text-slate-400 mt-3">
            Paying holds your seat. Your bus and pickup time are set once bookings close
            for this sitting, and appear under My Bookings.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-400 mt-2">
          See the fare before you commit — it is calculated from your pin to the centre.
        </p>
      )}
    </div>
  );
}
