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
 * Pays for an existing (pending) booking. Works in two modes:
 *  - DEV mock mode (no Razorpay keys): instantly confirms.
 *  - Real mode: opens Razorpay checkout and verifies server-side.
 * Resolves true on success, throws on failure/cancel.
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
      prefill: { name: user?.name, email: user?.email },
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
