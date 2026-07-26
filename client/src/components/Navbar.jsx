import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-brand text-lg">
          🚌 ExamRoute
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user && (
            <>
              <Link to="/exams" className="hover:text-brand">Exams</Link>
              <Link to="/my-bookings" className="hover:text-brand">My Bookings</Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="hover:text-brand">Admin</Link>
              )}
              <span className="text-slate-500">{user.name}</span>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="text-red-600 hover:underline"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
