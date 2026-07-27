import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

// Conductor view — opened by scanning the passenger's QR ticket.
// Requires the conductor to be logged in as an admin account.
export default function VerifyTicket() {
  const { token } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .get(`/tickets/${token}`)
      .then((r) => setTicket(r.data))
      .catch((e) => setErr(e.response?.data?.message || 'Could not load ticket'));
  }

  useEffect(() => {
    load();
  }, [token]);

  async function board() {
    setBusy(true);
    setMsg('');
    try {
      const r = await api.post(`/tickets/${token}/board`);
      setMsg(r.data.message);
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || 'Could not board');
    } finally {
      setBusy(false);
    }
  }

  if (user && user.role !== 'admin')
    return (
      <p className="text-sm text-slate-600">
        This ticket-verification page is for conductors. Please sign in with a conductor
        (admin) account.
      </p>
    );

  if (err) return <p className="text-red-600">{err}</p>;
  if (!ticket) return <p>Loading ticket…</p>;

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-3">Ticket verification</h2>
      <div className="bg-white border rounded-lg p-5 text-sm space-y-1">
        <p className="text-lg font-medium">{ticket.passenger}</p>
        {ticket.rollNumber && <p>Roll / application no: <b>{ticket.rollNumber}</b></p>}
        <p>{ticket.exam} · {ticket.shift}</p>
        <p>Center: {ticket.center}</p>
        <p>Seats: {ticket.seats} · Stop: {ticket.stop || '—'}</p>
        <p>Bus: {ticket.bus || 'not assigned yet'}</p>
        <p>
          Payment:{' '}
          {ticket.paid ? (
            <span className="text-green-700 font-medium">PAID ✓</span>
          ) : (
            <span className="text-red-600 font-medium">NOT PAID</span>
          )}
        </p>

        <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-amber-800">
          👀 Check the passenger's <b>admit card</b> matches the name/roll number above
          before boarding them.
        </div>

        {ticket.boarded ? (
          <p className="mt-3 text-green-700 font-medium">
            Already boarded at {new Date(ticket.boardedAt).toLocaleTimeString()}
          </p>
        ) : (
          <button
            onClick={board}
            disabled={busy || !ticket.paid}
            className="mt-3 w-full bg-brand text-white py-2 rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Boarding…' : 'Confirm admit card & mark boarded'}
          </button>
        )}
        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </div>
    </div>
  );
}
