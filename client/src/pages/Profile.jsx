import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LocationPicker from '../components/LocationPicker';
import AddressSearch, { reverseGeocode } from '../components/AddressSearch';

/**
 * The two things the app needs to know about a person, and nothing else.
 *
 * Split into two cards because they are answers to different questions — who
 * to call, and where to collect from — and because the location half needs a
 * map, which in one long column pushed the save button so far down it looked
 * like the form had no end. Grouping also makes the page legible at a glance:
 * two blocks with headings rather than five stacked inputs.
 */
export default function Profile() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const welcome = params.get('welcome') === '1';
  const [phone, setPhone] = useState(user?.phone || '');
  const [coords, setCoords] = useState({
    lat: user?.homeLocation?.coordinates?.[1] || '',
    lng: user?.homeLocation?.coordinates?.[0] || '',
  });
  const [address, setAddress] = useState(user?.homeLocation?.address || '');
  const [msg, setMsg] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasPin = coords.lat !== '' && coords.lng !== '';

  /**
   * The pin is the source of truth — fare and pickup stop are both derived
   * from it — so whenever it moves we look up what is actually there and
   * rewrite the address to match. Otherwise the two drift apart and the text
   * quietly describes somewhere the student is not.
   */
  async function pinMoved(lat, lng) {
    setCoords({ lat, lng });
    try {
      const found = await reverseGeocode(lat, lng);
      if (found) setAddress(found);
    } catch {
      // Non-fatal: the coordinates are what get saved.
    }
  }

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => pinMoved(pos.coords.latitude, pos.coords.longitude),
      () => {
        setFailed(true);
        setMsg('Could not read your location. Search for your address instead.');
      }
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setFailed(false);
    try {
      const body = { phone };
      if (hasPin) {
        body.coordinates = [Number(coords.lng), Number(coords.lat)];
        body.address = address;
      }
      const res = await api.patch('/auth/profile', body);
      setUser(res.data.user);
      setMsg('Profile saved.');
      if (welcome) navigate('/exams'); // first-time setup done -> go book
    } catch {
      setFailed(true);
      setMsg('Could not save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-mid">
      {welcome && (
        <div className="notice bg-brand-soft/60 border-brand/20 text-brand-dark mb-6">
          Welcome to ExamRoute. Set your home location so we can pool you onto the
          right bus — you will only do this once.
        </div>
      )}

      <h2 className="page-title">My profile</h2>
      <p className="muted mt-1.5 mb-6">
        Saved once and reused for every exam you book. Your roll number is asked per
        exam, since each one issues its own.
      </p>

      <form onSubmit={save} className="space-y-5">
        <section className="card p-6">
          <h3 className="font-semibold text-slate-900">Your details</h3>
          <p className="muted mt-1 mb-5">How the operations team reaches you on the day.</p>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="label" htmlFor="profile-name">
                Name
              </label>
              <input
                id="profile-name"
                className="input bg-slate-50 text-slate-500 cursor-not-allowed"
                value={user?.name || ''}
                disabled
              />
              {/* A greyed-out field with no explanation looks like a bug. */}
              <p className="text-xs text-slate-400 mt-1.5">
                Fixed — it is checked against your admit card when you board.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="profile-phone">
                Phone
              </label>
              <input
                id="profile-phone"
                className="input"
                type="tel"
                autoComplete="tel"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1.5">
                Used only if the bus is delayed or you have not reached your stop.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h3 className="font-semibold text-slate-900">Home location</h3>
          <p className="muted mt-1 mb-4">
            Search your address or tap the map to drop the pin — the two stay in sync.
            This is what decides your pickup stop and your fare.
          </p>

          <AddressSearch
            value={address}
            onChange={setAddress}
            onPick={(lat, lng) => setCoords({ lat, lng })}
          />

          <div className="mt-3">
            <LocationPicker lat={coords.lat} lng={coords.lng} onChange={pinMoved} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <button
              type="button"
              onClick={useMyLocation}
              className="text-sm text-brand hover:underline"
            >
              Use my current location
            </button>
            {hasPin ? (
              <span className="text-xs text-slate-400">
                Pin at {Number(coords.lat).toFixed(4)}, {Number(coords.lng).toFixed(4)}
              </span>
            ) : (
              <span className="text-xs text-amber-700">No pin dropped yet</span>
            )}
          </div>
        </section>

        {/*
          The save button and its result belong on the same line. Previously
          the message appeared above the button, which moved the button down
          the instant you pressed it.
        */}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save profile'}
          </button>
          {msg && (
            <p className={`text-sm ${failed ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>
          )}
        </div>
      </form>
    </div>
  );
}
