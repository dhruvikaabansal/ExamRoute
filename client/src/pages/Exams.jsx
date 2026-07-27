import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/exams').then((res) => {
      setExams(res.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading exams…</p>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Upcoming Exams (Rajasthan)</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {exams.map((e) => (
          <div key={e._id} className="bg-white rounded-lg border p-4 shadow-sm">
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
            <Link
              to={`/book/${e._id}`}
              className="mt-3 inline-block bg-brand text-white text-sm px-4 py-2 rounded hover:bg-brand-dark"
            >
              Book a seat
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
