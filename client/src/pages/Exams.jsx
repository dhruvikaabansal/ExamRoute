import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { fmtDate } from '../lib/format';

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/exams')
      .then((res) => setExams(res.data))
      .catch(() => setError('Could not load the exam list. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading exams…</p>;

  if (error)
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-5 text-red-700">{error}</div>
    );

  /*
    An empty catalogue is a real state, and it used to render as a heading
    above nothing at all — which looks like a bug rather than an answer.
  */
  if (exams.length === 0)
    return (
      <div className="bg-white border rounded-lg p-6 text-center">
        <p className="text-4xl mb-2">🗓️</p>
        <h2 className="font-semibold">No exams listed yet</h2>
        <p className="text-sm text-slate-500 mt-1">
          Nothing has been scheduled for this state. Check back once the exam calendar
          is published.
        </p>
      </div>
    );

  return (
    <div>
      <div className="bg-gradient-to-r from-brand to-brand-light rounded-xl px-5 py-6 text-white mb-6">
        <h2 className="text-2xl font-bold">Upcoming exams in Rajasthan</h2>
        <p className="text-white/90 text-sm mt-1">
          {exams.length} exams open for pooling. Pick one, drop your home pin, and we
          work out the rest.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {exams.map((e) => {
          /*
            Booking windows close before the exam. Letting someone pick a
            sitting, drop a pin, choose companions and reach payment before
            telling them the window shut is a wasted journey through the whole
            form — the deadline belongs here, on the way in.
          */
          const closed =
            e.bookingDeadline && new Date(e.bookingDeadline).getTime() < Date.now();

          return (
            <div
              key={e._id}
              className={`bg-white rounded-xl border p-5 transition hover:shadow-card hover:-translate-y-0.5 ${
                closed ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold bg-brand-soft text-brand-dark px-2.5 py-1 rounded-full">
                  {e.code}
                </span>
                {e.multiShift ? (
                  <span className="text-xs text-slate-500">multiple dates &amp; shifts</span>
                ) : (
                  <span className="text-xs text-slate-500">single shift</span>
                )}
              </div>

              <h3 className="mt-2 font-medium">{e.name}</h3>
              <p className="text-sm text-slate-500">{e.description}</p>

              {e.bookingDeadline && (
                <p className={`text-xs mt-2 ${closed ? 'text-red-600' : 'text-slate-500'}`}>
                  {closed
                    ? `Bookings closed on ${fmtDate(e.bookingDeadline)}`
                    : `Bookings close ${fmtDate(e.bookingDeadline)}`}
                </p>
              )}

              {closed ? (
                <span className="mt-4 inline-block bg-slate-100 text-slate-400 text-sm px-5 py-2.5 rounded-full cursor-not-allowed">
                  Booking closed
                </span>
              ) : (
                <Link
                  to={`/book/${e._id}`}
                  className="mt-4 inline-block bg-brand text-white text-sm font-medium px-5 py-2.5 rounded-full hover:bg-brand-dark transition"
                >
                  Book a seat →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
