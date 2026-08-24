import { useEffect, useMemo, useState } from 'react';
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

/**
 * Is this booking finished with?
 *
 * A ticket is never deleted — it is a paid receipt, it carries the refund
 * trail, and a student may well need it months later. But once the paper has
 * started, the journey it describes is over, and a finished trip sitting at
 * the top of the list next to next month's exam is noise at exactly the moment
 * the list needs to be scannable.
 *
 * `examStart` is the honest cut-off for a *travel* app: by then the bus has
 * delivered them and there is nothing left for ExamRoute to do. A cancelled
 * seat is done with too, whatever its date.
 */
function isFinished(b) {
  if (b.status === 'cancelled') return true;
  const start = b.session?.examStart;
  return start ? new Date(start).getTime() < Date.now() : false;
}

export default function MyBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(null);
  const [showPast, setShowPast] = useState(false);
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

  /*
    The server sorts newest-booked first, which is the wrong order for a page
    about travel: what matters is which bus you have to catch next. Upcoming
    trips run soonest-first; the archive runs most-recent-first, because that
    is the one you are most likely to be looking for.
  */
  const { upcoming, past } = useMemo(() => {
    const at = (b) => new Date(b.session?.examStart || 0).getTime();
    return {
      upcoming: bookings.filter((b) => !isFinished(b)).sort((a, b) => at(a) - at(b)),
      past: bookings.filter(isFinished).sort((a, b) => at(b) - at(a)),
    };
  }, [bookings]);

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

  const cardProps = {
    showQR,
    setShowQR,
    paying,
    cancelling,
    onPay: pay,
    onCancel: cancel,
  };

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

      {upcoming.length > 0 ? (
        <div className="space-y-4">
          {upcoming.map((b) => (
            <BookingCard key={b._id} b={b} {...cardProps} />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <h3 className="font-semibold text-slate-900">Nothing coming up</h3>
          <p className="muted mt-1.5 max-w-sm mx-auto">
            Your past trips are below. Book a seat for your next exam and it will
            appear here.
          </p>
          <Link to="/exams" className="btn-primary mt-5">
            Browse exams →
          </Link>
        </div>
      )}

      {/*
        Finished trips are kept, not deleted — a paid ticket is a receipt, and
        the refund trail lives on it. They are just folded away, because a
        journey you already took should not compete for attention with one you
        have not.
      */}
      {past.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-brand transition"
          >
            <span className={`transition-transform ${showPast ? 'rotate-90' : ''}`}>›</span>
            {showPast ? 'Hide' : 'Show'} {past.length} past trip
            {past.length === 1 ? '' : 's'}
          </button>

          {showPast && (
            <div className="space-y-4 mt-4">
              {past.map((b) => (
                <BookingCard key={b._id} b={b} past {...cardProps} />
              ))}
            </div>
          )}
        </div>
      )}

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

/**
 * One ticket.
 *
 * `past` is not a different card, it is the same card with the live parts
 * removed: nothing to pay, nothing to cancel, nothing to track. Offering a
 * "Cancel this booking" button on a trip that already happened is a button
 * whose only outcome is an error message — the server refuses it, correctly.
 */
function BookingCard({ b, past, showQR, setShowQR, paying, cancelling, onPay, onCancel }) {
  const verifyUrl = `${window.location.origin}/verify/${b.ticketToken}`;
  const isPaid = b.status === 'paid' || b.status === 'assigned';

  return (
    <div className={`card-pad ${past ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{b.exam?.name}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {past && b.status !== 'cancelled' && (
            <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-500">
              completed
            </span>
          )}
          <span className={`text-xs px-2 py-1 rounded ${statusColor[b.status]}`}>
            {b.boarded ? 'boarded' : b.status}
          </span>
        </div>
      </div>

      {/*
        The date is not optional detail — it is the thing that distinguishes
        one booking from another. JEE runs three dates with two shifts each, so
        "Shift 1 (9 AM - 12 PM)" alone made two entirely different sittings
        render as identical twins.
      */}
      <p className="text-sm text-slate-500 mt-1">
        {b.session && <b className="text-slate-700">{fmtDate(b.session.examStart)}</b>}
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

      {!past && b.status === 'pending' && (
        <button
          onClick={() => onPay(b._id)}
          disabled={paying === b._id}
          className="btn-primary mt-3"
        >
          {paying === b._id ? 'Processing…' : `Complete payment · ₹${b.fare}`}
        </button>
      )}

      {!past && b.assignedStop?.name && (
        <>
          <p className="text-sm text-slate-600 mt-2">
            Pickup stop: <b>{b.assignedStop.name}</b>
            {stopDistanceLabel(b.stopDistanceKm, b.stopEtaMin) &&
              ` — ${stopDistanceLabel(b.stopDistanceKm, b.stopEtaMin)}`}
          </p>
          {/*
            Say so when no catchment zone covered them. Reaching a stop 60 km
            away is a different proposition from one down the road, and the
            student needs to plan for it.
          */}
          {b.stopInsideZone === false && (
            <p className="notice bg-amber-50 border-amber-200 text-amber-800 mt-2">
              Your home is outside every pickup zone, so this is simply the nearest
              stop we have. You will need to get yourself there — please plan for the{' '}
              {b.stopEtaMin} minutes.
            </p>
          )}
        </>
      )}

      {!past && b.status === 'assigned' && b.bus && (
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
            Two different clocks, and conflating them was the bug: the time the
            passenger is asked to be there is deliberately a few minutes before
            the bus is due, so a bus that has to wait at six stops does not
            make forty people late.
          */}
          <p>
            Be at your stop by: <b>{fmtDateTime(b.boardBy || b.pickupTime)}</b>
            {(b.boardBy || b.pickupTime) && (
              <span className="text-slate-500">
                {' '}
                ({fmtRelative(b.boardBy || b.pickupTime)})
              </span>
            )}
          </p>
          {/*
            Only worth a line of its own when it is a different time. Buses
            routed before the boarding buffer existed have no boardBy, and
            printing the same clock twice under two different labels is exactly
            the confusion the buffer was added to remove.
          */}
          {b.boardBy && (
            <p>
              Bus reaches your stop: <b>{fmtDateTime(b.pickupTime)}</b>
            </p>
          )}
          <p>
            Reaches the exam centre by: <b>{fmtDateTime(b.bus.arrivalTime)}</b>
          </p>
          <p className="text-xs text-slate-500">
            All times shown in IST. Please do not be late — the bus cannot wait for one
            passenger without making everyone else late too.
          </p>
        </div>
      )}

      {!past && b.status === 'paid' && (
        <p className="notice bg-slate-50 border-slate-200 text-slate-600 mt-3">
          Paid and confirmed. Your bus is formed once bookings close for this sitting —
          the departure time and a tracking link appear right here.
        </p>
      )}

      {!past && b.boarded && (
        <p className="notice bg-green-50 border-green-200 text-green-800 mt-3">
          You are aboard. Nothing left to do but the exam.
        </p>
      )}

      {/*
        The one-line epilogue for a finished trip. Which of the three it is
        matters: "you travelled with us" and "you paid and never boarded" are
        very different facts to find in an archive a month later.
      */}
      {past && b.status !== 'cancelled' && (
        <p className="text-sm text-slate-500 mt-3">
          {b.boarded
            ? `Travelled with us on ${fmtDate(b.session?.examStart)}${
                b.assignedStop?.name ? ` from ${b.assignedStop.name}` : ''
              }.`
            : 'This sitting has passed. Our records do not show you boarding.'}
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
          {b.refundStatus === 'pending' && `Refund of ₹${b.refundAmount} is being processed.`}
          {b.refundStatus === 'failed' &&
            `₹${b.refundAmount} is owed to you — the automatic refund failed and our team is settling it manually.`}
        </p>
      )}

      {/*
        The row of things you can do with this ticket, together at the bottom
        rather than scattered through the card. A finished trip keeps only the
        QR, because that is the receipt.
      */}
      {(isPaid || (!past && b.status !== 'cancelled')) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100">
          {isPaid && b.ticketToken && (
            <button
              onClick={() => setShowQR(showQR === b._id ? null : b._id)}
              className="btn-dark btn-sm"
            >
              {showQR === b._id ? 'Hide ticket' : past ? 'Show past ticket' : 'Show QR ticket'}
            </button>
          )}
          {!past && b.status === 'assigned' && b.bus && (
            <Link to={`/track/${b._id}`} className="text-sm text-brand hover:underline">
              Track bus live →
            </Link>
          )}
          {!past && b.status !== 'cancelled' && !b.boarded && (
            <button
              onClick={() => onCancel(b._id)}
              disabled={cancelling === b._id}
              className="text-xs text-slate-400 hover:text-red-600 hover:underline disabled:opacity-50 ml-auto"
            >
              {cancelling === b._id ? 'Cancelling…' : 'Cancel this booking'}
            </button>
          )}
        </div>
      )}

      {showQR === b._id && (
        <div className="mt-3 flex flex-wrap items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
          <QRCodeSVG value={verifyUrl} size={128} />
          <div className="text-xs text-slate-500 min-w-0">
            {past ? (
              <p>Kept as your record of this trip.</p>
            ) : (
              <>
                <p>Show this at the bus door when you board.</p>
                <p className="mt-1">It is scanned and checked against your admit card.</p>
              </>
            )}
            <p className="mt-1 break-all text-slate-400">{verifyUrl}</p>
          </div>
        </div>
      )}
    </div>
  );
}
