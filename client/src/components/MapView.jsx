import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default marker icons (they break under bundlers by default)
const icon = (color) =>
  new L.Icon({
    iconUrl: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png`,
    iconRetinaUrl: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png`,
    shadowUrl: `https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    className: color === 'red' ? 'hue-red' : color === 'green' ? 'hue-green' : '',
  });

// coordinates come in as [lng, lat] (GeoJSON); Leaflet wants [lat, lng]
const toLatLng = (c) => [c[1], c[0]];

/**
 * Props:
 *  home        [lng,lat]           - student home (optional)
 *  center      [lng,lat]           - exam center (optional)
 *  stops       [{name,coordinates}] - pickup stops (optional)
 *  route       [{name,coordinates}] - ordered bus route to draw a line (optional)
 *  bus         {lng,lat}            - live bus position (optional)
 *  geofenceKm  number              - draw catchment circles around stops
 */
/**
 * A live position is only usable if it is actually two numbers.
 *
 * `currentLocation` is a nested path on the Bus schema, so Mongoose returns an
 * empty object rather than undefined for a bus whose driver has not started
 * sharing yet. That object is truthy, so it reached Leaflet as
 * `[undefined, undefined]`, Leaflet threw "Invalid LatLng object", and with no
 * error boundary above it React unmounted the whole application — a blank
 * white page on both the driver screen and live tracking.
 */
const hasPosition = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

export default function MapView({ home, center, stops = [], route = [], bus, geofenceKm = 0, height = 320 }) {
  const livePosition = hasPosition(bus) ? bus : null;

  const points = [];
  if (home) points.push(toLatLng(home));
  if (center) points.push(toLatLng(center));
  stops.filter((s) => Array.isArray(s?.coordinates)).forEach((s) => points.push(toLatLng(s.coordinates)));
  if (livePosition) points.push([livePosition.lat, livePosition.lng]);

  const fallback = [26.9124, 75.7873]; // Jaipur
  const centerPoint = points[0] || fallback;

  const routeLine = route
    .filter((s) => Array.isArray(s?.coordinates))
    .map((s) => toLatLng(s.coordinates));

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border">
      <MapContainer center={centerPoint} zoom={9} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {home && (
          <Marker position={toLatLng(home)} icon={icon('blue')}>
            <Popup>Your home</Popup>
          </Marker>
        )}

        {center && (
          <Marker position={toLatLng(center)} icon={icon('red')}>
            <Popup>Exam center</Popup>
          </Marker>
        )}

        {stops.filter((s) => Array.isArray(s?.coordinates)).map((s, i) => (
          <div key={i}>
            <Marker position={toLatLng(s.coordinates)} icon={icon('green')}>
              <Popup>{s.name}</Popup>
            </Marker>
            {geofenceKm > 0 && (
              <Circle
                center={toLatLng(s.coordinates)}
                radius={geofenceKm * 1000}
                pathOptions={{ color: '#2563eb', fillOpacity: 0.06, weight: 1 }}
              />
            )}
          </div>
        ))}

        {routeLine.length > 1 && (
          <Polyline positions={routeLine} pathOptions={{ color: '#2563eb', weight: 3 }} />
        )}

        {livePosition && (
          <Marker position={[livePosition.lat, livePosition.lng]} icon={icon('red')}>
            <Popup>🚌 Bus (live)</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
