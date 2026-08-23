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
      <div className="notice bg-red-50 border-red-200 text-red-700 p-5">{error}</div>
    );

  /*
    An empty catalogue is a real state, and it used to render as a heading
    above nothing at all — which looks like a bug rather than an answer.
  */
  if (exams.length === 0)
    return (
      <div className="bg-white border rounded-lg p-6 text-center">
        <p className="text-4xl mb-2"></p>
        <h2 className="font-semibold">No exams listed yet</h2>
        <p className="text-sm text-slate-500 mt-1">
          Nothing has been scheduled for this state. Check back once the exam calendar
          is published.
        </p>
      </div>
    );

  return (
    <div>
      {/*
        Plain type on white. A saturated banner reads as decoration and pushes
        the actual content down; the colour is worth more when it is reserved
        for the thing you want pressed.
      */}
      <h2 className="page-title">Upcoming exams</h2>
      <p className="muted mt-1.5 mb-7">
        {exams.length} exams open for pooling across Rajasthan.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
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
              className={`card-pad card-link ${closed ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className="badge-brand">
                  {e.code}
                </span>
                {e.multiShift ? (
                  <span className="text-xs text-slate-500">multiple dates &amp; shifts</span>
                ) : (
                  <span className="text-xs text-slate-500">single shift</span>
                )}
              </div>

              <h3 className="mt-3 font-semibold text-slate-900">{e.name}</h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{e.description}</p>

              {e.bookingDeadline && (
                <p className={`text-xs mt-2 ${closed ? 'text-red-600' : 'text-slate-500'}`}>
                  {closed
                    ? `Bookings closed on ${fmtDate(e.bookingDeadline)}`
                    : `Bookings close ${fmtDate(e.bookingDeadline)}`}
                </p>
              )}

              {closed ? (
                <span className="btn bg-slate-100 text-slate-400 mt-4 cursor-not-allowed">
                  Booking closed
                </span>
              ) : (
                <Link
                  to={`/book/${e._id}`}
                  className="btn-primary mt-4"
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
