import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';

// Driver view — shares the bus's live GPS while a trip runs. For demos there's
// also a "Simulate driving" button that moves the bus along its planned route
// (no GPS / location permission needed).
export default function DriverPage() {
  const { busId } = useParams();
  const [bus, setBus] = useState(null);
  const [mode, setMode] = useState(null); // 'gps' | 'sim' | null
  const [last, setLast] = useState(null);
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState('');
  const watchId = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    api.get(`/admin/bus/${busId}`).then((r) => setBus(r.data)).catch(() => setErr('Bus not found'));
    return () => stop();
  }, [busId]);

  async function post(lng, lat) {
    setPos({ lng, lat });
    try {
      await api.post(`/admin/bus/${busId}/location`, { lng, lat });
      setLast(new Date());
    } catch {
      /* keep trying */
    }
  }

  function startGps() {
    if (!navigator.geolocation) return setErr('Geolocation not supported');
    setErr('');
    setMode('gps');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => post(p.coords.longitude, p.coords.latitude),
      () => setErr('Could not get location — allow location permission, or use Simulate.'),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  // Build the full path: each route stop -> ... -> exam center
  function buildPath() {
    const pts = (bus.route || []).map((s) => s.coordinates);
    if (bus.center?.location?.coordinates) pts.push(bus.center.location.coordinates);
    return pts;
  }

  function startSim() {
    setErr('');
    setMode('sim');
    const path = buildPath();
    if (path.length < 2) return setErr('Not enough route points to simulate');

    // interpolate ~20 steps between each consecutive pair
    const steps = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [aLng, aLat] = path[i];
      const [bLng, bLat] = path[i + 1];
      for (let t = 0; t < 20; t++) {
        steps.push([aLng + ((bLng - aLng) * t) / 20, aLat + ((bLat - aLat) * t) / 20]);
      }
    }
    steps.push(path[path.length - 1]);

    let i = 0;
    timer.current = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(timer.current);
        timer.current = null;
        return;
      }
      const [lng, lat] = steps[i++];
      post(lng, lat);
    }, 1500);
  }

  function stop() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (timer.current) clearInterval(timer.current);
    watchId.current = null;
    timer.current = null;
    setMode(null);
  }

  if (err && !bus) return <p className="text-red-600">{err}</p>;
  if (!bus) return <p>Loading…</p>;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-1">Driver — {bus.label}</h2>
      <p className="text-sm text-slate-500 mb-4">
        Share your live location so students can track the bus. Keep this page open during the trip.
      </p>

      <div className="bg-white border rounded-lg p-5">
        {!mode ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={startGps} className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark">
              ▶ Share my real GPS
            </button>
            <button onClick={startSim} className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700">
              🧪 Simulate driving (demo)
            </button>
          </div>
        ) : (
          <button onClick={stop} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
            ■ Stop
          </button>
        )}

        {mode && (
          <p className="text-sm text-green-700 mt-3">
            📡 {mode === 'sim' ? 'Simulating route' : 'Broadcasting GPS'}…
            {last && ` last update ${last.toLocaleTimeString()}`}
          </p>
        )}
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      </div>

      <div className="mt-4">
        <MapView
          center={bus.center?.location?.coordinates}
          stops={bus.route}
          route={bus.route}
          bus={pos || (bus.currentLocation ? bus.currentLocation : undefined)}
          height={320}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Students see this same 🚌 moving on their “Track bus live” page.
      </p>
    </div>
  );
}
