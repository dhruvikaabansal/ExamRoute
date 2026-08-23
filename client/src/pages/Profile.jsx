import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import LocationPicker from '../components/LocationPicker';
import AddressSearch, { reverseGeocode } from '../components/AddressSearch';

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
  const [busy, setBusy] = useState(false);

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
      () => alert('Could not get location. Enter it manually.')
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const body = { phone };
      if (coords.lat && coords.lng) {
        body.coordinates = [Number(coords.lng), Number(coords.lat)];
        body.address = address;
      }
      const res = await api.patch('/auth/profile', body);
      setUser(res.data.user);
      setMsg('Profile saved');
      if (welcome) navigate('/exams'); // first-time setup done -> go book
    } catch {
      setMsg('Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      {welcome && (
        <div className="notice bg-slate-50 border-slate-200 text-slate-600 mb-5">
          Welcome to ExamRoute! Set your home location so we can pool you onto the
          right bus. You'll only do this once.
        </div>
      )}
      <h2 className="page-title">My profile</h2>
      <p className="muted mt-1.5 mb-6">
        Saved once and reused for every exam you book. Your roll number is asked per
        exam, since each one issues its own.
      </p>

      <form onSubmit={save} className="card p-6 space-y-5">
        <div>
          <label className="label">Name</label>
          <input className="input mt-1 bg-slate-50 text-slate-500" value={user?.name || ''} disabled />
        </div>
        <div>
          <label className="label">Phone</label>
          <input
            className="input mt-1"
            placeholder="Contact number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Home location</label>
          <p className="text-xs text-slate-500 mb-2">
            Search your address, or tap the map to drop the pin. The two stay in sync.
          </p>
          <AddressSearch
            value={address}
            onChange={setAddress}
            onPick={(lat, lng) => setCoords({ lat, lng })}
          />
          <div className="mt-2">
            <LocationPicker lat={coords.lat} lng={coords.lng} onChange={pinMoved} />
          </div>
          <button type="button" onClick={useMyLocation} className="text-sm text-brand mt-2 hover:underline">
            Use my current location
          </button>
          {coords.lat !== '' && coords.lng !== '' && (
            <p className="text-xs text-slate-400 mt-1">
              Pin: {Number(coords.lat).toFixed(4)}, {Number(coords.lng).toFixed(4)}
            </p>
          )}
        </div>

        {msg && (
          <p className={`text-sm ${msg === 'Could not save' ? 'text-red-600' : 'text-green-700'}`}>{msg}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary"
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
