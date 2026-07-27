import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

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

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
      setMsg('Saved ✓');
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
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-brand-dark">
          👋 Welcome to ExamRoute! Set your home location so we can pool you onto the
          right bus. You'll only do this once.
        </div>
      )}
      <h2 className="text-xl font-semibold mb-1">My Profile</h2>
      <p className="text-sm text-slate-500 mb-4">
        Save your home location and phone — we reuse these across every exam you book.
        (Your exam roll number is asked per exam when you book, since each exam has its own.)
      </p>

      <form onSubmit={save} className="space-y-3 bg-white border rounded-lg p-5">
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input className="w-full border rounded p-2 mt-1 bg-slate-50" value={user?.name || ''} disabled />
        </div>
        <div>
          <label className="block text-sm font-medium">Phone</label>
          <input
            className="w-full border rounded p-2 mt-1"
            placeholder="Contact number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Home location</label>
          <div className="flex gap-2 mt-1">
            <input
              className="border rounded p-2 w-1/2"
              placeholder="Latitude"
              value={coords.lat}
              onChange={(e) => setCoords({ ...coords, lat: e.target.value })}
            />
            <input
              className="border rounded p-2 w-1/2"
              placeholder="Longitude"
              value={coords.lng}
              onChange={(e) => setCoords({ ...coords, lng: e.target.value })}
            />
          </div>
          <button type="button" onClick={useMyLocation} className="text-sm text-brand mt-2 hover:underline">
            📍 Use my current location
          </button>
          <input
            className="border rounded p-2 w-full mt-2"
            placeholder="Address (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        {msg && <p className="text-sm text-green-700">{msg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
