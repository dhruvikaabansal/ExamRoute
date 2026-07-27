import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';

export default function Confirmation() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .get(`/bookings/${id}`)
      .then((r) => setBooking(r.data))
      .catch(() => setErr('Could not load booking'));
  }, [id]);

  if (err) return <p className="text-red-600">{err}</p>;
  if (!booking) return <p>Loading…</p>;

  const home = booking.homeLocation?.coordinates;
  const stop = booking.assignedStop;
  const center = booking.center?.location?.coordinates;

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-green-50 border border-green-200 rounded-lg p-5 text-center">
        <div className="text-3xl">🎉</div>
        <h2 className="text-xl font-semibold text-green-800 mt-1">Ticket booked!</h2>
        <p className="text-green-700 text-sm mt-1">All the best for your exam 📚</p>
      </div>

      <div className="bg-white border rounded-lg p-5 mt-4 text-sm space-y-1">
        <p><b>{booking.exam?.name}</b></p>
        <p className="text-slate-500">
          {booking.session?.shiftLabel} · {booking.center?.name}, {booking.center?.city}
        </p>
        {booking.rollNumber && <p className="text-slate-500">Roll no: {booking.rollNumber}</p>}
        <p>Seats: <b>{booking.seats}</b> · Paid <b>₹{booking.fare}</b>
          {booking.subsidyPercent > 0 && (
            <span className="text-green-700"> ({booking.subsidyPercent}% subsidy)</span>
          )}
        </p>

        {stop?.name ? (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3">
            <p>🚏 Your nearest pickup stop: <b>{stop.name}</b></p>
            <p className="text-slate-600">
              About <b>{booking.stopDistanceKm} km</b> (~<b>{booking.stopEtaMin} min</b>) from your home.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Your exact bus &amp; departure time appear in “My Bookings” once routing is done.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-slate-500">We'll assign your nearest pickup stop shortly.</p>
        )}
      </div>

      {(home || stop || center) && (
        <div className="mt-4">
          <MapView
            home={home}
            center={center}
            stops={stop?.coordinates ? [{ name: stop.name, coordinates: stop.coordinates }] : []}
            geofenceKm={5}
            height={300}
          />
          <p className="text-xs text-slate-400 mt-1">
            Blue = home, green = pickup stop (with catchment zone), red = exam center.
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <Link to="/my-bookings" className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark">
          View my tickets
        </Link>
        <Link to="/exams" className="bg-slate-200 px-4 py-2 rounded hover:bg-slate-300">
          Book another
        </Link>
      </div>
    </div>
  );
}
