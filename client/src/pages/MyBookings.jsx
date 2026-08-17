import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { payBooking } from '../lib/pay';
import { fmtDateTime, fmtRelative } from '../lib/format';

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  assigned: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function MyBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(null);
  const [paying, setPaying] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  function load() {
    return api.get('/bookings/mine').then((res) => {
      setBookings(res.data);
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function pay(bookingId) {
    setPaying(bookingId);
    try {
      await payBooking(bookingId, user);
      navigate(`/booking/${bookingId}/confirmed`);
    } catch (e) {
      alert(e.response?.data?.message || e.message || 'Payment failed');
    } finally {
      setPaying(null);
    }
  }

  /**
   * Ask the server what the refund would be, show it, and only then cancel.
   *
   * The refund tiers live on the server, so the quote is produced by the same
   * function the cancel endpoint uses — the number in this dialog is the
   * number the student actually gets. Telling them the amount only after an
   * irreversible action would be a dark pattern.
   */
  async function cancel(bookingId) {
    setCancelling(bookingId);
    try {
      let prompt = 'Cancel this seat? Your place on the bus will be released.';
      try {
        const { data: q } = await api.get(`/bookings/${bookingId}/refund-quote`);
        if (!q.unpaid) {
          prompt =
            `${q.reason}.\n\n` +
            `You paid ₹${q.amountPaid} · refund ₹${q.amount} (${q.percent}%).\n\n` +
            'Cancel this seat? This cannot be undone.';
        }
      } catch {
        // A quote is a courtesy, not a precondition. If it fails we still let
        // the student cancel, with the generic warning.
      }
      if (!window.confirm(prompt)) return;

      const res = await api.post(`/bookings/${bookingId}/cancel`);
      if (res.data.refundNote) alert(res.data.refundNote);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Could not cancel');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (bookings.length === 0) return <p>No bookings yet.</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">My Bookings</h2>
      <div className="space-y-4">
        {bookings.map((b) => {
          const verifyUrl = `${window.location.origin}/verify/${b.ticketToken}`;
          const isPaid = b.status === 'paid' || b.status === 'assigned';
          return (
            <div key={b._id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{b.exam?.name}</h3>
                <span className={`text-xs px-2 py-1 rounded ${statusColor[b.status]}`}>
                  {b.boarded ? 'boarded ✓' : b.status}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {b.session && `${b.session.shiftLabel} · `}
                {b.center?.name}, {b.center?.city}
                {b.rollNumber && ` · Roll ${b.rollNumber}`}
              </p>
              <p className="text-sm text-slate-500">
                {b.seats} seat{b.seats > 1 ? 's' : ''} · {b.distanceKm} km ·{' '}
                {isPaid ? `paid ₹${b.fare}` : `fare ₹${b.fare}`}
                {b.subsidyPercent > 0 && (
                  <span className="text-green-700"> ({b.subsidyPercent}% subsidy)</span>
                )}
              </p>

              {b.status === 'pending' && (
                <button
                  onClick={() => pay(b._id)}
                  disabled={paying === b._id}
                  className="mt-2 bg-brand text-white text-sm px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
                >
                  {paying === b._id ? 'Processing…' : `Complete payment · ₹${b.fare}`}
                </button>
              )}

              {b.assignedStop?.name && (
                <p className="text-sm text-slate-600 mt-1">
                  🚏 Pickup stop: <b>{b.assignedStop.name}</b>
                  {b.stopDistanceKm != null && ` (~${b.stopEtaMin} min from home)`}
                </p>
              )}

              {b.status === 'assigned' && b.bus && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-sm">
                  <p>
                    🚌 <b>{b.bus.label}</b>
                    {b.bus.isOvernight && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        overnight — leaves the night before
                      </span>
                    )}
                  </p>
                  <p>
                    Be at your stop by: <b>{fmtDateTime(b.pickupTime)}</b>
                    {b.pickupTime && (
                      <span className="text-slate-500"> ({fmtRelative(b.pickupTime)})</span>
                    )}
                  </p>
                  <p>Bus departs: <b>{fmtDateTime(b.bus.departureTime)}</b></p>
                  <p>Reaches centre by: <b>{fmtDateTime(b.bus.arrivalTime)}</b></p>
                  <p className="text-xs text-slate-500">All times shown in IST.</p>
                  <Link
                    to={`/track/${b._id}`}
                    className="inline-block mt-2 text-brand hover:underline"
                  >
                    📍 Track bus live
                  </Link>
                </div>
              )}

              {b.status === 'paid' && (
                <p className="mt-2 text-sm text-slate-500">
                  Paid ✓ — your bus &amp; pickup time appear here once routing is done.
                </p>
              )}

              {b.status === 'cancelled' && b.refundStatus && b.refundStatus !== 'none' && (
                <p
                  className={`mt-2 text-sm ${
                    b.refundStatus === 'failed' ? 'text-red-600' : 'text-slate-600'
                  }`}
                >
                  {b.refundStatus === 'processed' &&
                    `💸 ₹${b.refundAmount} refunded to your original payment method.`}
                  {b.refundStatus === 'pending' &&
                    `💸 Refund of ₹${b.refundAmount} is being processed.`}
                  {b.refundStatus === 'failed' &&
                    `⚠️ ₹${b.refundAmount} is owed to you — the automatic refund failed and our team is settling it manually.`}
                </p>
              )}

              {b.status !== 'cancelled' && !b.boarded && (
                <button
                  onClick={() => cancel(b._id)}
                  disabled={cancelling === b._id}
                  className="mt-2 ml-0 text-xs text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
                >
                  {cancelling === b._id ? 'Cancelling…' : 'Cancel this booking'}
                </button>
              )}

              {isPaid && b.ticketToken && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowQR(showQR === b._id ? null : b._id)}
                    className="text-sm bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700"
                  >
                    {showQR === b._id ? 'Hide ticket' : '🎫 Show QR ticket'}
                  </button>
                  {showQR === b._id && (
                    <div className="mt-3 flex items-center gap-4 bg-slate-50 border rounded p-3">
                      <QRCodeSVG value={verifyUrl} size={128} />
                      <div className="text-xs text-slate-500">
                        <p>Show this to the conductor when boarding.</p>
                        <p className="mt-1">They scan it and check your admit card matches.</p>
                        <p className="mt-1 break-all text-slate-400">{verifyUrl}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
