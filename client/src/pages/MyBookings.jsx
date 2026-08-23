import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import NextStep from '../components/NextStep';
import { payBooking } from '../lib/pay';
import { fmtDate, fmtDateTime, fmtRelative } from '../lib/format';

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  assigned: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

/**
 * "0 km from your home, about 1 min" is arithmetically true and reads like a
 * bug. When somebody drops their pin on the bus stand itself, say that.
 */
function stopDistanceLabel(km, etaMin) {
  if (km == null) return null;
  if (km < 0.5) return 'practically on your doorstep';
  return `${km} km from home, about ${etaMin} min away`;
}

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

  if (loading) return <p className="page-wide">Loading…</p>;

  /*
    An empty list is a fork in the road, not a full stop — the whole point of
    landing here with nothing is that you have not booked yet.
  */
  if (bookings.length === 0)
    return (
      <div className="page-wide">
        <h2 className="page-title mb-5">My Bookings</h2>
        <div className="card p-8 text-center">
          <h3 className="font-semibold text-slate-900">No tickets yet</h3>
          <p className="muted mt-1.5 max-w-sm mx-auto">
            Once you book a seat for an exam it appears here, with your pickup stop,
            your QR ticket and live tracking on the day.
          </p>
          <Link to="/exams" className="btn-primary mt-5">
            Browse exams →
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page-wide">
      <h2 className="page-title mb-5">My Bookings</h2>
      <div className="space-y-4">
        {bookings.map((b) => {
          const verifyUrl = `${window.location.origin}/verify/${b.ticketToken}`;
          const isPaid = b.status === 'paid' || b.status === 'assigned';
          return (
            <div key={b._id} className="card-pad">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{b.exam?.name}</h3>
                <span className={`text-xs px-2 py-1 rounded ${statusColor[b.status]}`}>
                  {b.boarded ? 'boarded' : b.status}
                </span>
              </div>
              {/*
                The date is not optional detail — it is the thing that
                distinguishes one booking from another. JEE runs three dates
                with two shifts each, so "Shift 1 (9 AM - 12 PM)" alone made
                two entirely different sittings render as identical twins.
              */}
              <p className="text-sm text-slate-500 mt-1">
                {b.session && (
                  <b className="text-slate-700">{fmtDate(b.session.examStart)}</b>
                )}
                {b.session && ` · ${b.session.shiftLabel} · `}
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
                  className="btn-primary mt-3"
                >
                  {paying === b._id ? 'Processing…' : `Complete payment · ₹${b.fare}`}
                </button>
              )}

              {b.assignedStop?.name && (
                <>
                  <p className="text-sm text-slate-600 mt-2">
                    Pickup stop: <b>{b.assignedStop.name}</b>
                    {stopDistanceLabel(b.stopDistanceKm, b.stopEtaMin) &&
                      ` — ${stopDistanceLabel(b.stopDistanceKm, b.stopEtaMin)}`}
                  </p>
                  {/*
                    Say so when no catchment zone covered them. Reaching a stop
                    60 km away is a different proposition from one down the
                    road, and the student needs to plan for it.
                  */}
                  {b.stopInsideZone === false && (
                    <p className="notice bg-amber-50 border-amber-200 text-amber-800 mt-2">
                      Your home is outside every pickup zone, so this is simply the
                      nearest stop we have. You will need to get yourself there —
                      please plan for the {b.stopEtaMin} minutes.
                    </p>
                  )}
                </>
              )}

              {b.status === 'assigned' && b.bus && (
                <div className="notice bg-green-50 border-green-200 text-slate-700 mt-3 space-y-1">
                  <p className="font-medium text-slate-900">
                    {b.bus.label}
                    {b.bus.isOvernight && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-normal">
                        overnight — leaves the night before
                      </span>
                    )}
                  </p>
                  {/*
                    Two different clocks, and conflating them was the bug: the
                    time the passenger is asked to be there is deliberately a
                    few minutes before the bus is due, so a bus that has to
                    wait at six stops does not make forty people late.
                  */}
                  <p>
                    Be at your stop by:{' '}
                    <b>{fmtDateTime(b.boardBy || b.pickupTime)}</b>
                    {(b.boardBy || b.pickupTime) && (
                      <span className="text-slate-500">
                        {' '}
                        ({fmtRelative(b.boardBy || b.pickupTime)})
                      </span>
                    )}
                  </p>
                  <p>
                    Bus reaches your stop: <b>{fmtDateTime(b.pickupTime)}</b>
                  </p>
                  <p>
                    Reaches the exam centre by: <b>{fmtDateTime(b.bus.arrivalTime)}</b>
                  </p>
                  <p className="text-xs text-slate-500">
                    All times shown in IST. Please do not be late — the bus cannot wait
                    for one passenger without making everyone else late too.
                  </p>
                </div>
              )}

              {b.status === 'paid' && (
                <p className="notice bg-slate-50 border-slate-200 text-slate-600 mt-3">
                  Paid and confirmed. Your bus is formed once bookings close for this
                  sitting — the departure time and a tracking link appear right here.
                </p>
              )}

              {b.boarded && (
                <p className="notice bg-green-50 border-green-200 text-green-800 mt-3">
                  You are aboard. Nothing left to do but the exam.
                </p>
              )}

              {b.status === 'cancelled' && b.refundStatus && b.refundStatus !== 'none' && (
                <p
                  className={`mt-2 text-sm ${
                    b.refundStatus === 'failed' ? 'text-red-600' : 'text-slate-600'
                  }`}
                >
                  {b.refundStatus === 'processed' &&
                    `₹${b.refundAmount} refunded to your original payment method.`}
                  {b.refundStatus === 'pending' &&
                    `Refund of ₹${b.refundAmount} is being processed.`}
                  {b.refundStatus === 'failed' &&
                    `₹${b.refundAmount} is owed to you — the automatic refund failed and our team is settling it manually.`}
                </p>
              )}

              {/*
                The row of things you can do with this ticket, together at the
                bottom rather than scattered through the card.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100">
                {isPaid && b.ticketToken && (
                  <button
                    onClick={() => setShowQR(showQR === b._id ? null : b._id)}
                    className="btn-dark btn-sm"
                  >
                    {showQR === b._id ? 'Hide ticket' : 'Show QR ticket'}
                  </button>
                )}
                {b.status === 'assigned' && b.bus && (
                  <Link to={`/track/${b._id}`} className="text-sm text-brand hover:underline">
                    Track bus live →
                  </Link>
                )}
                {b.status !== 'cancelled' && !b.boarded && (
                  <button
                    onClick={() => cancel(b._id)}
                    disabled={cancelling === b._id}
                    className="text-xs text-slate-400 hover:text-red-600 hover:underline disabled:opacity-50 ml-auto"
                  >
                    {cancelling === b._id ? 'Cancelling…' : 'Cancel this booking'}
                  </button>
                )}
              </div>

              {showQR === b._id && (
                <div className="mt-3 flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <QRCodeSVG value={verifyUrl} size={128} />
                  <div className="text-xs text-slate-500 min-w-0">
                    <p>Show this at the bus door when you board.</p>
                    <p className="mt-1">
                      It is scanned and checked against your admit card.
                    </p>
                    <p className="mt-1 break-all text-slate-400">{verifyUrl}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <NextStep
        title="Also worth doing"
        actions={[
          { to: '/exams', label: 'Book another exam' },
          { to: '/profile', label: 'Update my home location' },
        ]}
      >
        Booking a second sitting reuses everything here — you only re-enter the roll
        number, since each exam issues its own.
      </NextStep>
    </div>
  );
}
