import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import NextStep from '../components/NextStep';
import { fmtDateTime } from '../lib/format';

/**
 * Opened by scanning a passenger's QR ticket.
 *
 * Two audiences share this page. Staff see the boarding control; the
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

  // Boarding is a staff action. Admin is the only account role that has it.
  const isStaff = user?.role === 'admin';

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

  if (err)
    return (
      <div className="page-narrow">
        <p className="notice bg-red-50 border-red-200 text-red-700">{err}</p>
        <NextStep
          title="Try this instead"
          actions={[{ to: isStaff ? '/admin' : '/my-bookings', label: 'Back to my list' }]}
        >
          A ticket link that will not open is usually one that was truncated when it was
          copied, or a booking that has since been cancelled.
        </NextStep>
      </div>
    );
  if (!ticket) return <p className="page-narrow">Loading ticket…</p>;

  return (
    <div className="page-narrow">
      <h2 className="page-title mb-3">
        {isStaff ? 'Ticket verification' : 'Your e-ticket'}
      </h2>

      <div className="card p-6 text-sm space-y-1">
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
        {/* The time the passenger was given, not the time the bus is due. */}
        {(ticket.boardByLabel || ticket.pickupTimeLabel) && (
          <p>
            Be at the stop by: <b>{ticket.boardByLabel || ticket.pickupTimeLabel}</b>
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

        {isStaff ? (
          <>
            {/*
              The honest verification step. No third party can digitally confirm
              someone is a genuine exam candidate, so the app verifies the
              ticket and a human verifies the person.
            */}
            <div className="notice bg-amber-50 border-amber-200 text-amber-800 mt-3">
              Check the passenger&apos;s <b>admit card</b> matches the name and roll
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
                className="btn-primary w-full mt-3"
              >
                {busy ? 'Boarding…' : 'Confirm admit card & mark boarded'}
              </button>
            )}
          </>
        ) : (
          <div className="notice bg-slate-50 border-slate-200 text-slate-600 mt-3">
            {ticket.boarded ? (
              <p className="text-green-700 font-medium">
                Boarded at {fmtDateTime(ticket.boardedAt)}
              </p>
            ) : (
              <p>Show this at the bus door along with your admit card.</p>
            )}
          </div>
        )}

        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </div>

      {/*
        A scan is one passenger out of forty. Whoever is holding the phone is
        mid-way through a queue, so the useful link is back to the list they
        are working down — not a dead end on a single ticket.
      */}
      <NextStep
        actions={
          isStaff
            ? [
                { to: '/admin', label: 'Back to the boarding lists' },
                { to: '/my-bookings', label: 'My own tickets' },
              ]
            : [{ to: '/my-bookings', label: 'Back to my tickets' }]
        }
      >
        {isStaff
          ? 'Scan the next passenger, or work down the boarding list for this bus to see who is still missing.'
          : ticket.boarded
            ? 'You are aboard. Your bus can be followed live from My Bookings until it reaches the centre.'
            : 'Keep this screen handy — staff scan it at the bus door, alongside your admit card.'}
      </NextStep>
    </div>
  );
}
