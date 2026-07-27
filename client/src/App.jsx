import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Exams from './pages/Exams';
import BookExam from './pages/BookExam';
import Confirmation from './pages/Confirmation';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import VerifyTicket from './pages/VerifyTicket';
import DriverPage from './pages/DriverPage';
import TrackBus from './pages/TrackBus';

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
        <Routes>
          <Route path="/" element={user ? <Navigate to="/exams" /> : <Login />} />
          <Route path="/exams" element={<Protected><Exams /></Protected>} />
          <Route path="/book/:examId" element={<Protected><BookExam /></Protected>} />
          <Route path="/booking/:id/confirmed" element={<Protected><Confirmation /></Protected>} />
          <Route path="/my-bookings" element={<Protected><MyBookings /></Protected>} />
          <Route path="/track/:bookingId" element={<Protected><TrackBus /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/admin" element={<Protected><Admin /></Protected>} />
          <Route path="/drive/:busId" element={<Protected><DriverPage /></Protected>} />
          <Route path="/verify/:token" element={<Protected><VerifyTicket /></Protected>} />
        </Routes>
      </main>
    </div>
  );
}
