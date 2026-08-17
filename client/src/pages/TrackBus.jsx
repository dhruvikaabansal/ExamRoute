import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';
import { fmtTime } from '../lib/format';

// Student view — polls the assigned bus's live location every few seconds.
export default function TrackBus() {
  const { bookingId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await api.get(`/bookings/${bookingId}/bus-location`);
        if (alive) setData(r.data);
      } catch (e) {
        if (alive) setErr(e.response?.data?.message || 'No bus yet');
      }
    }
    poll();
    const t = setInterval(poll, 5000); // refresh every 5s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [bookingId]);

  if (err) return <p className="text-slate-600">{err}</p>;
  if (!data) return <p>Loading…</p>;

  const bus = data.currentLocation;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-1">Live bus tracking</h2>
      <p className="text-sm text-slate-500 mb-3">
        {bus
          ? `Bus last seen ${fmtTime(data.lastLocationAt)}. Refreshes automatically.`
          : 'The driver hasn’t started sharing location yet. This page will update when they do.'}
      </p>
      <MapView
        stops={data.route || []}
        route={data.route || []}
        bus={bus || undefined}
        height={380}
      />
      {!bus && (
        <p className="text-xs text-slate-400 mt-2">
          Showing your planned route. The live 🚌 marker appears once the driver starts sharing.
        </p>
      )}
    </div>
  );
}
