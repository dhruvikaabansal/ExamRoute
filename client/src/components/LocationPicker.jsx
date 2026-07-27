import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// keeps the map centered on the current point when it changes (preset / my-location)
function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([Number(lat), Number(lng)], map.getZoom());
  }, [lat, lng]);
  return null;
}

/**
 * Click-to-pick home location on a map. No coordinates to type.
 * value: { lat, lng } (strings/numbers). onChange(lat, lng).
 */
export default function LocationPicker({ lat, lng, onChange, height = 260 }) {
  const has = lat !== '' && lng !== '' && lat != null && lng != null;
  const center = has ? [Number(lat), Number(lng)] : [26.9124, 75.7873]; // Jaipur default

  return (
    <div style={{ height }} className="rounded-lg border overflow-hidden">
      <MapContainer center={center} zoom={7} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onChange} />
        <Recenter lat={lat} lng={lng} />
        {has && <Marker position={[Number(lat), Number(lng)]} icon={pin} />}
      </MapContainer>
    </div>
  );
}
