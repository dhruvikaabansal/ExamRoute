import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';

/**
 * Routes are code-split.
 *
 * Everything used to ship in one ~430 kB bundle, which meant a student on a
 * 3G connection in a small town downloaded Leaflet, the QR library and the
 * admin screen before they could see the login form — and those users are
 * precisely the ones this project exists for. Login stays in the main chunk
 * because it is the first thing everyone sees; the map-heavy and admin
 * screens load only when they are actually opened.
 */
const Exams = lazy(() => import('./pages/Exams'));
const BookExam = lazy(() => import('./pages/BookExam'));
const Confirmation = lazy(() => import('./pages/Confirmation'));
const MyBookings = lazy(() => import('./pages/MyBookings'));
const Profile = lazy(() => import('./pages/Profile'));
const Admin = lazy(() => import('./pages/Admin'));
const VerifyTicket = lazy(() => import('./pages/VerifyTicket'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const TrackBus = lazy(() => import('./pages/TrackBus'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center">Loading…</div>;
  return user ? children : <Navigate to="/" />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}>
          <Routes>
            <Route path="/" element={user ? <Navigate to="/exams" /> : <Login />} />
            <Route path="/exams" element={<Protected><Exams /></Protected>} />
            <Route path="/book/:examId" element={<Protected><BookExam /></Protected>} />
            <Route path="/booking/:id/confirmed" element={<Protected><Confirmation /></Protected>} />
            <Route path="/my-bookings" element={<Protected><MyBookings /></Protected>} />
            <Route path="/track/:bookingId" element={<Protected><TrackBus /></Protected>} />
            <Route path="/profile" element={<Protected><Profile /></Protected>} />
            <Route path="/admin" element={<Protected><Admin /></Protected>} />
            {/*
              The driver page is deliberately NOT wrapped in <Protected>: it is
              authorised by the capability token in the URL, so a driver needs no
              account. Previously this route required a login, which meant the
              "driver link" only worked for someone holding admin credentials.
            */}
            <Route path="/drive/:driverToken" element={<DriverPage />} />
            <Route path="/verify/:token" element={<Protected><VerifyTicket /></Protected>} />
            {/*
              Anything else. Without this, an unknown URL matched no route and
              rendered a blank page that looks like a crash.
            */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
