import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { fmtDateTime, fmtTime } from '../lib/format';

/**
 * The boarding list for one bus.
 *
 * Scanning tickets one at a time answers "is this person allowed on?" but
 * never "who is still missing?" — and at 2 AM, standing at the second of six
 * stops, that second question is the one that decides whether the bus waits.
 * This is the same list a real operator boards from: everyone on the bus,
 * grouped by pickup stop in the order the bus visits them, ticked off as they
 * arrive.
 *
 * Marking someone boarded goes through the same endpoint the QR scan uses, so
 * there is one boarding path and one set of rules — a ticket cannot be boarded
 * twice, or before it is paid, whichever way staff reach it.
 */
export default function Manifest() {
  const { busId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [working, setWorking] = useState('');

  function load() {
    return api
      .get(`/admin/bus/${busId}/manifest`)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.response?.data?.message || 'Could not load the boarding list'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busId]);

  async function board(passenger) {
    if (
      !window.confirm(
        `Board ${passenger.name}?\n\nRoll ${passenger.rollNumber}\n\n` +
          'Check their admit card matches this name and number first.'
      )
    )
      return;

    setWorking(passenger.bookingId);
    try {
      await api.post(`/tickets/${passenger.ticketToken}/board`);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || 'Could not board this passenger');
    } finally {
      setWorking('');
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.stops;
    return data.stops
      .map((stop) => ({
        ...stop,
        passengers: stop.passengers.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.rollNumber || '').toLowerCase().includes(q)
        ),
      }))
      .filter((stop) => stop.passengers.length > 0);
  }, [data, query]);

  if (error)
    return (
      <div className="notice bg-red-50 border-red-200 text-red-700 p-5">
        {error}
        <div className="mt-3">
          <Link to="/admin" className="text-brand hover:underline text-sm">
            ← Back to Admin
          </Link>
        </div>
      </div>
    );

  if (!data) return <p>Loading boarding list…</p>;

  const { bus, totals } = data;
  const allBoarded = totals.remaining === 0 && totals.passengers > 0;

  return (
    <div>
      <Link to="/admin" className="text-sm text-brand hover:underline">
        ← Back to Admin
      </Link>

      <h2 className="page-title mt-2">Boarding list — {bus.label}</h2>
      <p className="text-sm text-slate-500">
        Departs <b>{fmtDateTime(bus.departureTime)}</b> · reaching {bus.center} by{' '}
        <b>{fmtDateTime(bus.arrivalTime)}</b>
      </p>

      {/*
        Passengers and seats are different numbers and used to sit side by side
        with no hint of that — "still to board 25" next to "39/40 seats" reads
        like an error until you realise companions are the difference. The
        units are now on the tiles, and the arithmetic is spelled out below
        them rather than left to be inferred.
      */}
      <div className="grid grid-cols-3 gap-3 my-4">
        {[
          ['passengers boarded', `${totals.boarded}/${totals.passengers}`],
          ['passengers still to board', totals.remaining],
          ['seats filled', `${totals.seats}/${bus.capacity}`],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {totals.seats > totals.passengers && (
        <p className="text-xs text-slate-500 -mt-2 mb-4">
          {totals.passengers} passengers occupy {totals.seats} seats —{' '}
          {totals.seats - totals.passengers} of them are booked for parents or guardians
          travelling with a student.
        </p>
      )}

      {allBoarded && (
        <p className="notice bg-green-50 border-green-200 text-green-800 mb-4">
          Everyone is aboard. The bus can leave.
        </p>
      )}

      <input
        className="input mb-4"
        placeholder="Search by name or roll number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 && (
        <p className="card-pad muted">
          {query ? 'Nobody on this bus matches that.' : 'No passengers assigned to this bus.'}
        </p>
      )}

      <div className="space-y-4">
        {filtered.map((stop) => (
          <div key={stop.name} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
              <div>
                <b className="text-sm">{stop.name}</b>
                {stop.pickupTime && (
                  <span className="text-xs text-slate-500 ml-2">
                    pickup {fmtTime(stop.pickupTime)}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500">
                {stop.boarded}/{stop.passengers.length} boarded · {stop.seats} seats
              </span>
            </div>

            <ul className="divide-y">
              {stop.passengers.map((p) => (
                <li
                  key={p.bookingId}
                  className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${
                    p.boarded ? 'bg-green-50/60' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {p.name}
                      {p.seats > 1 && (
                        <span className="text-xs text-slate-500 ml-2">
                          +{p.seats - 1} companion{p.seats > 2 ? 's' : ''}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      Roll {p.rollNumber}
                      {/* Staff need a way to chase someone who has not arrived. */}
                      {p.phone && ` · ${p.phone}`}
                    </p>
                  </div>

                  {p.boarded ? (
                    <span className="text-xs text-green-700 whitespace-nowrap">
                      ✓ boarded {p.boardedAt ? fmtTime(p.boardedAt) : ''}
                    </span>
                  ) : (
                    <button
                      onClick={() => board(p)}
                      disabled={working === p.bookingId}
                      className="btn-dark btn-sm"
                    >
                      {working === p.bookingId ? 'Boarding…' : 'Mark boarded'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Check each passenger's admit card against the name and roll number before marking
        them aboard. The app confirms the ticket is real and paid; you confirm the person is.
      </p>
    </div>
  );
}
