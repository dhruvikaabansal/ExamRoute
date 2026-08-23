import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';
import NextStep from '../components/NextStep';
import { fmtDate } from '../lib/format';

/**
 * The receipt, and the honest answer to "so when is my bus?".
 *
 * At this moment the bus genuinely does not exist: routing runs once for a
 * whole sitting, after bookings close, because you cannot cluster students who
 * have not booked yet. Saying so plainly is better than a confirmation screen
 * that quietly omits the one thing the student wants to know and leaves them
 * refreshing for a departure time that is days away.
 */
export default function Confirmation() {
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .get(`/bookings/${id}`)
      .then((r) => setBooking(r.data))
      .catch(() => setErr('Could not load this booking.'));
  }, [id]);

  if (err)
    return (
      <div className="page-mid">
        <p className="notice bg-red-50 border-red-200 text-red-700">{err}</p>
        <NextStep title="Try this instead" actions={[{ to: '/my-bookings', label: 'Open my tickets' }]}>
          Your booking is safe — this page just could not load it.
        </NextStep>
      </div>
    );
  if (!booking) return <p className="page-mid">Loading…</p>;

  const home = booking.homeLocation?.coordinates;
  const stop = booking.assignedStop;
  const center = booking.center?.location?.coordinates;

  return (
    <div className="page-mid">
      <div className="notice bg-green-50 border-green-200 text-green-800 text-center py-5">
        <h2 className="text-xl font-semibold">Seat booked</h2>
        <p className="text-sm mt-1">
          Your ticket is paid and held. All the best for the exam.
        </p>
      </div>

      <div className="card p-6 mt-5 space-y-4">
        <div>
          <h3 className="font-semibold text-slate-900">{booking.exam?.name}</h3>
          <p className="muted mt-0.5">
            {booking.session?.examStart && `${fmtDate(booking.session.examStart)} · `}
            {booking.session?.shiftLabel} · {booking.center?.name}, {booking.center?.city}
          </p>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-slate-100 pt-4">
          {[
            ['Roll number', booking.rollNumber || '—'],
            ['Seats', booking.seats],
            ['Distance', `${booking.distanceKm} km`],
            [
              'Paid',
              <>
                ₹{booking.fare}
                {booking.subsidyPercent > 0 && (
                  <span className="block text-xs text-green-700">
                    after {booking.subsidyPercent}% subsidy
                  </span>
                )}
              </>,
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-900 mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>

        {stop?.name ? (
          <div className="notice bg-slate-50 border-slate-200 text-slate-600">
            Your pickup stop is <b className="text-slate-900">{stop.name}</b> — about{' '}
            <b>{booking.stopDistanceKm} km</b> from home, roughly{' '}
            <b>{booking.stopEtaMin} minutes</b> away.
            {booking.stopInsideZone === false && (
              <span className="block mt-1 text-amber-800">
                That is outside every catchment zone we cover, so plan how you will
                reach it.
              </span>
            )}
          </div>
        ) : (
          <p className="muted">Your nearest pickup stop will be assigned shortly.</p>
        )}
      </div>

      {(home || stop || center) && (
        <div className="mt-5">
          <MapView
            home={home}
            center={center}
            stops={stop?.coordinates ? [{ name: stop.name, coordinates: stop.coordinates }] : []}
            geofenceKm={5}
            height={300}
          />
          <p className="text-xs text-slate-400 mt-1.5">
            Blue is your home, green is your pickup stop with its catchment zone, red is
            the exam centre.
          </p>
        </div>
      )}

      <NextStep
        actions={[
          { to: '/my-bookings', label: 'View my tickets' },
          { to: '/exams', label: 'Book another exam' },
        ]}
      >
        Buses are formed once bookings close for this sitting — we group everyone
        travelling to the same centre, then work backwards from the reporting time to
        set departures. Your bus, your stop&apos;s exact pickup time and a live
        tracking link all appear under <b>My Bookings</b> as soon as that runs.
      </NextStep>
    </div>
  );
}
