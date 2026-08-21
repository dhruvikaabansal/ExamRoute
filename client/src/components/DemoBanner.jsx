import { useEffect, useState } from 'react';
import api from '../api/client';

/**
 * Tells visitors that payments on this deployment are simulated.
 *
 * The public demo has no Razorpay keys, so "Pay" marks a booking paid without
 * charging anything. Someone arriving from a link has no way to know that, and
 * a payment screen that silently isn't a payment screen is the kind of thing
 * that should be said out loud rather than discovered.
 *
 * The server is the source of truth — it is the side that knows whether keys
 * are configured — so this asks /health rather than trusting a build-time flag
 * that could disagree with the API it is pointed at.
 */
export default function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/health')
      .then((res) => !cancelled && setDemo(Boolean(res.data?.demoMode)))
      // A banner is a courtesy. If the check fails, say nothing rather than
      // blocking the page on it.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo) return null;

  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm text-center px-4 py-2">
      <b>Demo deployment.</b> Payments are simulated — no card is charged and no
      real bus is booked. Everything else works exactly as it would in production.
    </div>
  );
}
