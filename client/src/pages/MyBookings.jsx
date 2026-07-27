import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { payBooking } from '../lib/pay';

const statusColor = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-blue-100 text-blue-700',
  assigned: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const fmtDateTime = (d) =>
  new Date(d).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function MyBookings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(null);
  const [paying, setPaying] = useState(null);

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
                  <p>🚌 <b>{b.bus.label}</b></p>
                  <p>Be at your stop by: <b>{b.pickupTime && fmtDateTime(b.pickupTime)}</b></p>
                  <p>Bus departs: <b>{b.bus.departureTime && fmtDateTime(b.bus.departureTime)}</b></p>
                  <p>Reaches center by: <b>{b.bus.arrivalTime && fmtDateTime(b.bus.arrivalTime)}</b></p>
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
