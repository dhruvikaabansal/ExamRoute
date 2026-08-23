import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Top bar, in the shape travel-booking sites use: wordmark hard left, the
 * places you go in the middle, account at the far right.
 *
 * NavLink rather than Link so the current section is marked. Knowing where you
 * are is the cheapest orientation a nav can offer, and this app has enough
 * screens now that "which page am I on" is a real question.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Underline the current section rather than filling a pill. Quieter, and it
  // does not compete with the one pink button on the page.
  const link = ({ isActive }) =>
    `px-1 py-1 text-sm border-b-2 transition ${
      isActive
        ? 'border-brand text-slate-900 font-medium'
        : 'border-transparent text-slate-500 hover:text-slate-900'
    }`;

  // Signed out, the bar has nothing in it but the wordmark — and the login
  // page carries its own. An empty strip above a split screen is just a seam.
  if (!user) return null;

  return (
    <nav className="bg-white border-b sticky top-0 z-[900]">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl">🚌</span>
          <span className="font-bold text-lg tracking-tight text-brand">ExamRoute</span>
        </Link>

        {user && (
          <>
            <div className="hidden sm:flex items-center gap-6">
              <NavLink to="/exams" className={link}>Exams</NavLink>
              <NavLink to="/my-bookings" className={link}>My Bookings</NavLink>
              <NavLink to="/profile" className={link}>Profile</NavLink>
              {user.role === 'admin' && <NavLink to="/admin" className={link}>Admin</NavLink>}
            </div>

            <div className="flex items-center gap-3 text-sm shrink-0">
              <span className="hidden md:inline text-slate-500">{user.name}</span>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="text-slate-500 hover:text-brand transition"
              >
                Log out
              </button>
            </div>
          </>
        )}
      </div>

      {/* The same links, wrapped, on a narrow screen — a student booking a bus
          is far more likely to be on a phone than a laptop. */}
      {user && (
        <div className="sm:hidden flex items-center gap-5 overflow-x-auto px-4 pb-2">
          <NavLink to="/exams" className={link}>Exams</NavLink>
          <NavLink to="/my-bookings" className={link}>My Bookings</NavLink>
          <NavLink to="/profile" className={link}>Profile</NavLink>
          {user.role === 'admin' && <NavLink to="/admin" className={link}>Admin</NavLink>}
        </div>
      )}
    </nav>
  );
}
