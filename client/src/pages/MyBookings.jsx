import { useEffect, useState } from 'react';
import api from '../api/client';

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
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/bookings/mine').then((res) => {
      setBookings(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading…</p>;
  if (bookings.length === 0) return <p>No bookings yet.</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">My Bookings</h2>
      <div className="space-y-4">
        {bookings.map((b) => (
          <div key={b._id} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{b.exam?.name}</h3>
              <span className={`text-xs px-2 py-1 rounded ${statusColor[b.status]}`}>
                {b.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {b.session && `${b.session.shiftLabel} · `}
              {b.center?.name}, {b.center?.city}
            </p>
            <p className="text-sm text-slate-500">
              {b.seats} seat{b.seats > 1 ? 's' : ''} · {b.distanceKm} km · paid ₹{b.fare}
              {b.subsidyPercent > 0 && (
                <span className="text-green-700"> ({b.subsidyPercent}% subsidy)</span>
              )}
            </p>

            {b.status === 'assigned' && b.bus && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded p-3 text-sm">
                <p>🚌 <b>{b.bus.label}</b></p>
                <p>Pickup stop: <b>{b.assignedStop?.name}</b></p>
                <p>Be at your stop by: <b>{b.pickupTime && fmtDateTime(b.pickupTime)}</b></p>
                <p>Bus departs: <b>{b.bus.departureTime && fmtDateTime(b.bus.departureTime)}</b></p>
                <p>Reaches center by: <b>{b.bus.arrivalTime && fmtDateTime(b.bus.arrivalTime)}</b></p>
              </div>
            )}

            {b.status === 'paid' && (
              <p className="mt-2 text-sm text-slate-500">
                Paid ✓ — your bus &amp; pickup time will appear here once routing is done.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
