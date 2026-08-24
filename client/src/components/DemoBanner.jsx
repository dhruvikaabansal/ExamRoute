import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Says out loud whichever thing about this session is not quite real.
 *
 * Two situations, and only one banner, because two stacked strips of amber
 * push the actual page below the fold and stop being read at all.
 *
 * The payment case is the more serious of the two, so it wins when both
 * apply: a payment screen that silently is not a payment screen should be
 * announced rather than discovered.
 *
 * The guest case matters for a quieter reason. A throwaway account lives in
 * one browser and is never coming back — no email, no password, nothing to
 * sign back in with. Someone who books a seat, closes the tab and returns
 * tomorrow will find their booking gone, and without this they would
 * reasonably conclude the app lost it.
 */
export default function DemoBanner() {
  const { user } = useAuth();
  const [simulatedPayments, setSimulatedPayments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/health')
      // The server is the side that knows whether payment keys are configured,
      // so ask it rather than trusting a build-time flag that could disagree
      // with whichever API this build is actually pointed at.
      .then((res) => !cancelled && setSimulatedPayments(Boolean(res.data?.demoMode)))
      // A banner is a courtesy. If the check fails, say nothing rather than
      // blocking the page on it.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (simulatedPayments)
    return (
      <Strip>
        <b>Demo deployment.</b> Payments are simulated — no card is charged and no real
        bus is booked. Everything else behaves exactly as it would in production.
      </Strip>
    );

  if (user?.isDemo)
    return (
      <Strip>
        <b>Guest account.</b> Everything works, and payments run in test mode so no card
        is charged. This account only exists in this browser — sign in with Google to
        keep a booking.
      </Strip>
    );

  return null;
}

function Strip({ children }) {
  return (
    <div className="bg-amber-50 text-amber-900 border-b border-amber-200 text-xs sm:text-sm text-center px-4 py-2.5">
      {children}
    </div>
  );
}
