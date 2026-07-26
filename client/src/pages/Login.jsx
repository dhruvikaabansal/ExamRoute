import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      <h1 className="text-3xl font-bold text-brand">🚌 ExamRoute</h1>
      <p className="mt-3 text-slate-600">
        Share a bus to your exam center. Enter where you live, book a seat, and we
        pool you with nearby students heading to the same center — with an optimized
        pickup route and departure time.
      </p>

      <div className="mt-8 flex justify-center">
        <GoogleLogin
          onSuccess={async (cred) => {
            await loginWithGoogle(cred.credential);
            navigate('/exams');
          }}
          onError={() => alert('Google login failed')}
        />
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Sign in with Google to continue.
      </p>
    </div>
  );
}
