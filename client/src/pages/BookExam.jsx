import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

// loads the Razorpay checkout script once
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BookExam() {
  const { examId } = useParams();
  const navigate = useNavigate();

  const [centers, setCenters] = useState([]);
  const [centerId, setCenterId] = useState('');
  const [coords, setCoords] = useState({ lat: '', lng: '' });
  const [address, setAddress] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/exams/${examId}/centers`).then((res) => {
      setCenters(res.data);
      if (res.data[0]) setCenterId(res.data[0]._id);
    });
  }, [examId]);

  function useMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert('Could not get location. Enter it manually.')
    );
  }

  async function getQuote() {
    if (!centerId || !coords.lat || !coords.lng) return alert('Pick a center and location');
    const res = await api.post('/bookings/quote', {
      examId,
      centerId,
      coordinates: [Number(coords.lng), Number(coords.lat)],
    });
    setQuote(res.data);
  }

  async function bookAndPay() {
    setBusy(true);
    try {
      // 1. create pending booking
      const bookingRes = await api.post('/bookings', {
        examId,
        centerId,
        coordinates: [Number(coords.lng), Number(coords.lat)],
        address,
      });
      const booking = bookingRes.data;

      // 2. create Razorpay order
      const orderRes = await api.post('/payments/order', { bookingId: booking._id });
      const { orderId, amount, currency, keyId } = orderRes.data;

      // 3. open checkout
      const ok = await loadRazorpay();
      if (!ok) return alert('Failed to load payment gateway');

      const rzp = new window.Razorpay({
        key: keyId,
        amount,
        currency,
        name: 'ExamRoute',
        description: 'Bus seat booking',
        order_id: orderId,
        handler: async (response) => {
          // 4. verify signature server-side
          await api.post('/payments/verify', {
            bookingId: booking._id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          alert('Payment successful! Seat booked.');
          navigate('/my-bookings');
        },
      });
      rzp.open();
    } catch (err) {
      alert(err.response?.data?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-xl font-semibold mb-4">Book your seat</h2>

      <label className="block text-sm font-medium">Exam center</label>
      <select
        className="w-full border rounded p-2 mt-1 mb-4"
        value={centerId}
        onChange={(e) => setCenterId(e.target.value)}
      >
        {centers.map((c) => (
          <option key={c._id} value={c._id}>
            {c.name} — {c.city}
          </option>
        ))}
      </select>

      <label className="block text-sm font-medium">Your home location</label>
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
      <button onClick={useMyLocation} className="text-sm text-brand mt-2 hover:underline">
        📍 Use my current location
      </button>

      <input
        className="border rounded p-2 w-full mt-3"
        placeholder="Address (optional)"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      <button
        onClick={getQuote}
        className="mt-4 bg-slate-200 px-4 py-2 rounded text-sm hover:bg-slate-300"
      >
        Get fare estimate
      </button>

      {quote && (
        <div className="mt-4 bg-white border rounded p-4">
          <p className="text-sm">Distance to center: <b>{quote.distanceKm} km</b></p>
          <p className="text-sm">Estimated fare: <b>₹{quote.fare}</b></p>
          <button
            onClick={bookAndPay}
            disabled={busy}
            className="mt-3 bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? 'Processing…' : `Pay ₹${quote.fare} & book`}
          </button>
        </div>
      )}
    </div>
  );
}
