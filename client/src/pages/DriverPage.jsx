import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import MapView from '../components/MapView';
import { fmtDateTime, fmtTime } from '../lib/format';

/**
 * Driver view — shares the bus's live GPS while a trip runs.
 *
 * Authenticated by the capability token in the URL, not by a login. A driver
 * is not a system user, and the previous version required them to sign in with
 * the admin account, which in practice meant handing out the credential that
 * can also re-run routing and read every student's details. The link here
 * authorises exactly one bus and exactly two things: read its route, report
 * its position.
 *
 * For demos there is also a "Simulate driving" button that moves the bus along
 * its planned route, so live tracking can be shown without going outside.
 */
export default function DriverPage() {
  const { driverToken } = useParams();
  const [bus, setBus] = useState(null);
  const [mode, setMode] = useState(null); // 'gps' | 'sim' | null
  const [last, setLast] = useState(null);
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState('');
  const watchId = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    api
      .get(`/driver/${driverToken}`)
      .then((r) => setBus(r.data))
      .catch((e) =>
        setErr(e.response?.data?.message || 'This driver link is invalid or has been rotated')
      );
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverToken]);

  async function post(lng, lat) {
    setPos({ lng, lat });
    try {
      await api.post(`/driver/${driverToken}/location`, { lng, lat });
      setLast(new Date());
    } catch {
      /* transient failures are expected on a moving vehicle — keep trying */
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

  // Full path: each route stop → … → exam centre
  function buildPath() {
    const pts = (bus.route || []).map((s) => s.coordinates);
    if (bus.center?.coordinates) pts.push(bus.center.coordinates);
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

  if (err && !bus)
    return (
      <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-5">
        <p className="text-red-700 font-medium">{err}</p>
        <p className="text-sm text-red-600 mt-1">
          Ask the operations team to send you a fresh link.
        </p>
      </div>
    );
  if (!bus) return <p>Loading…</p>;

  return (
    <div className="max-w-xl mx-auto">
      <h2 className="text-xl font-semibold mb-1">Driver — {bus.label}</h2>
      <p className="text-sm text-slate-500">
        Share your live location so students can track the bus. Keep this page open
        during the trip.
      </p>
      <p className="text-xs text-slate-400 mb-4">
        No sign-in needed — this link works only for this bus.
      </p>

      <div className="bg-white border rounded-lg p-4 mb-4 text-sm space-y-1">
        <p>
          Departs <b>{fmtDateTime(bus.departureTime)}</b>
          {bus.isOvernight && (
            <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
              overnight trip
            </span>
          )}
        </p>
        <p>
          Must reach {bus.center?.name} by <b>{fmtDateTime(bus.arrivalTime)}</b>
        </p>
        <p className="text-slate-500">
          {bus.seatsUsed}/{bus.capacity} seats · {bus.route?.length || 0} pickup stops
        </p>
      </div>

      <ol className="bg-white border rounded-lg p-4 mb-4 text-sm list-decimal list-inside space-y-1">
        {(bus.route || []).map((stop, i) => (
          <li key={i}>
            {stop.name} — <b>{fmtTime(stop.pickupTime)}</b>
          </li>
        ))}
      </ol>

      <div className="bg-white border rounded-lg p-5">
        {!mode ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={startGps}
              className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark"
            >
              ▶ Share my real GPS
            </button>
            <button
              onClick={startSim}
              className="bg-slate-800 text-white px-4 py-2 rounded hover:bg-slate-700"
            >
              🧪 Simulate driving (demo)
            </button>
          </div>
        ) : (
          <button
            onClick={stop}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
          >
            ■ Stop
          </button>
        )}

        {mode && (
          <p className="text-sm text-green-700 mt-3">
            📡 {mode === 'sim' ? 'Simulating route' : 'Broadcasting GPS'}…
            {last && ` last update ${fmtTime(last)}`}
          </p>
        )}
        {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      </div>

      <div className="mt-4">
        <MapView
          center={bus.center?.coordinates}
          stops={bus.route}
          route={bus.route}
          bus={pos || bus.currentLocation || undefined}
          height={320}
        />
      </div>
      <p className="text-xs text-slate-400 mt-1">
        Students see this same 🚌 moving on their “Track bus live” page.
      </p>
    </div>
  );
}
