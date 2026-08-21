import { useEffect, useRef, useState } from 'react';

/**
 * Address search that actually moves the map pin.
 *
 * The address used to be a free-text box wired to nothing: typing "NIIT
 * University" saved the words and left the pin wherever it already was, so a
 * student could describe one home and be picked up near another. Since fare
 * and pickup stop are both derived from the coordinates, the text was not
 * merely decorative — it was actively misleading.
 *
 * Geocoding uses Nominatim (OpenStreetMap), which needs no API key, so this
 * works in the same key-free way as the rest of the app. Results are
 * restricted to India and debounced to respect Nominatim's one-request-per-
 * second usage policy. A production deployment would use a paid geocoder or
 * self-host Nominatim — the free service explicitly asks you not to build
 * heavy traffic on it.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org';

export async function reverseGeocode(lat, lng) {
  const url = `${ENDPOINT}/reverse?lat=${lat}&lon=${lng}&format=jsonv2&zoom=16&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Lookup failed');
  const data = await res.json();
  return data.display_name || '';
}

export default function AddressSearch({ value, onChange, onPick, disabled }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const boxRef = useRef(null);

  // Close the dropdown when the click lands anywhere else on the page.
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    // Only search what the user typed. Text arriving from a reverse lookup
    // would otherwise trigger a search for the address we just resolved.
    if (!touched) return;
    const query = (value || '').trim();
    if (query.length < 3) {
      setResults([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Debounced, because Nominatim asks for at most one request per second
    // and a keystroke-per-request would be abusive.
    const timer = setTimeout(async () => {
      try {
        const url =
          `${ENDPOINT}/search?q=${encodeURIComponent(query)}` +
          `&format=jsonv2&addressdetails=1&countrycodes=in&limit=5`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = res.ok ? await res.json() : [];
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setOpen(true);
        }
      } catch {
        // Search is an assist, not a requirement — the map still works.
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, touched]);

  function choose(place) {
    setOpen(false);
    setTouched(false);
    onChange(place.display_name);
    onPick(Number(place.lat), Number(place.lon));
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="border rounded p-2 w-full"
        placeholder="Search your address — e.g. NIIT University, Neemrana"
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => {
          setTouched(true);
          onChange(e.target.value);
        }}
        onFocus={() => results.length && setOpen(true)}
      />

      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-slate-400">searching…</span>
      )}

      {open && results.length > 0 && (
        <ul className="absolute z-[1000] left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-56 overflow-auto">
          {results.map((place) => (
            <li key={place.place_id}>
              <button
                type="button"
                onClick={() => choose(place)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b last:border-b-0"
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && (value || '').trim().length >= 3 && (
        <div className="absolute z-[1000] left-0 right-0 mt-1 bg-white border rounded shadow-lg px-3 py-2 text-sm text-slate-500">
          No match — drop the pin on the map instead.
        </div>
      )}
    </div>
  );
}
