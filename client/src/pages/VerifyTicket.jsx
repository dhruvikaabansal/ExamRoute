import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime } from '../lib/format';

/**
 * Opened by scanning a passenger's QR ticket.
 *
 * Two audiences share this page. A conductor sees the boarding control; the
 * passenger themselves sees the same ticket read-only, because the API allows
 * a booking's owner to read it. Everyone else is refused by the server — the
 * token being hard to guess is not authorisation, and students share ticket
 * screenshots freely.
 */
export default function VerifyTicket() {
  const { token } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const isConductor = ['conductor', 'admin'].includes(user?.role);

  function load() {
    api
      .get(`/tickets/${token}`)
      .then((r) => {
        setTicket(r.data);
        setErr('');
      })
      .catch((e) => setErr(e.response?.data?.message || 'Could not load ticket'));
  }

  useEffect(load, [token]);

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

  if (err) return <p className="text-red-600">{err}</p>;
  if (!ticket) return <p>Loading ticket…</p>;

  return (
    <div className="max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-3">
        {isConductor ? 'Ticket verification' : 'Your e-ticket'}
      </h2>

      <div className="bg-white border rounded-lg p-5 text-sm space-y-1">
        <p className="text-lg font-medium">{ticket.passenger}</p>
        {ticket.rollNumber && (
          <p>
            Roll / application no: <b>{ticket.rollNumber}</b>
          </p>
        )}
        <p>
          {ticket.exam} · {ticket.shift}
        </p>
        <p>Centre: {ticket.center}</p>
        <p>
          Seats: {ticket.seats} · Stop: {ticket.stop || '—'}
        </p>
        <p>Bus: {ticket.bus || 'not assigned yet'}</p>
        {ticket.pickupTimeLabel && (
          <p>
            Be at the stop by: <b>{ticket.pickupTimeLabel}</b>
          </p>
        )}
        {ticket.phone && <p className="text-slate-500">Contact: {ticket.phone}</p>}
        <p>
          Payment:{' '}
          {ticket.paid ? (
            <span className="text-green-700 font-medium">PAID ✓</span>
          ) : (
            <span className="text-red-600 font-medium">NOT PAID</span>
          )}
        </p>

        {isConductor ? (
          <>
            {/*
              The honest verification step. No third party can digitally confirm
              someone is a genuine exam candidate, so the app verifies the
              ticket and a human verifies the person.
            */}
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-amber-800">
              👀 Check the passenger's <b>admit card</b> matches the name and roll
              number above before boarding them.
            </div>

            {ticket.boarded ? (
              <p className="mt-3 text-green-700 font-medium">
                Already boarded at {fmtDateTime(ticket.boardedAt)}
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
          </>
        ) : (
          <div className="mt-3 bg-slate-50 border rounded p-3 text-slate-600">
            {ticket.boarded ? (
              <p className="text-green-700 font-medium">
                Boarded at {fmtDateTime(ticket.boardedAt)} ✓
              </p>
            ) : (
              <p>
                Show this to the conductor when boarding, along with your admit card.
              </p>
            )}
          </div>
        )}

        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </div>
    </div>
  );
}
