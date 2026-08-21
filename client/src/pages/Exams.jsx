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
      <h2 className="text-xl font-semibold mb-1">Upcoming Exams (Rajasthan)</h2>
      <p className="text-sm text-slate-500 mb-4">
        {exams.length} exams currently open for pooling.
      </p>

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
              className={`bg-white rounded-lg border p-4 shadow-sm ${closed ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold bg-blue-100 text-brand px-2 py-1 rounded">
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
                <span className="mt-3 inline-block bg-slate-200 text-slate-500 text-sm px-4 py-2 rounded cursor-not-allowed">
                  Booking closed
                </span>
              ) : (
                <Link
                  to={`/book/${e._id}`}
                  className="mt-3 inline-block bg-brand text-white text-sm px-4 py-2 rounded hover:bg-brand-dark"
                >
                  Book a seat
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
