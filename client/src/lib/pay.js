import api from '../api/client';

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

/**
 * Pays for an existing (pending) booking.
 *
 * Two modes: with no Razorpay keys a local run confirms instantly, which keeps
 * the project runnable with nothing but a database URL. Otherwise this opens
 * the real checkout and the result is verified server-side — the browser's
 * "payment succeeded" callback is not trusted, because anyone can produce one.
 *
 * Resolves true on success, throws on failure or cancellation.
 */
export async function payBooking(bookingId, user) {
  const orderRes = await api.post('/payments/order', { bookingId });

  if (orderRes.data.mock) {
    await api.post('/payments/mock-confirm', { bookingId });
    return true;
  }

  const { orderId, amount, currency, keyId } = orderRes.data;
  const ok = await loadRazorpay();
  if (!ok) throw new Error('Failed to load payment gateway');

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: keyId,
      amount,
      currency,
      name: 'ExamRoute',
      description: 'Bus seat booking',
      order_id: orderId,
      /*
        Prefill everything we already know.

        Razorpay will not proceed without a mobile number, and omitting it put
        an "Edit contact details" step in front of every payment — asking the
        student to type a number they had already given us on their profile.
        A form that asks twice for the same fact reads as broken even when
        nothing is wrong.
      */
      prefill: {
        name: user?.name,
        email: user?.email,
        contact: user?.phone || '',
      },
      // Checkout otherwise arrives in Razorpay blue, which looks like leaving
      // the site mid-payment — the one moment that should feel most continuous.
      theme: { color: '#db2777' },
      handler: async (response) => {
        try {
          await api.post('/payments/verify', {
            bookingId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          resolve(true);
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}
