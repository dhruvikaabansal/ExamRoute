import { Link } from 'react-router-dom';

/**
 * Catch-all for unknown URLs.
 *
 * Without this, React Router matched nothing and rendered an empty <main>
 * under the navbar — a blank page that looks like the app crashed rather than
 * like a wrong address. Mistyped links matter more than usual here: driver and
 * ticket links are long, random, and get retyped off a phone screen.
 */
export default function NotFound() {
  return (
    <div className="text-center py-16">
      <p className="text-5xl mb-3">🚏</p>
      <h2 className="text-xl font-semibold">This stop isn&apos;t on the route</h2>
      <p className="text-slate-500 mt-2">
        The page you asked for doesn&apos;t exist. If you followed a ticket or driver
        link, check it was copied in full — they&apos;re long and easy to truncate.
      </p>
      <Link
        to="/"
        className="inline-block mt-6 bg-brand text-white px-4 py-2 rounded hover:bg-brand-dark"
      >
        Back to safety
      </Link>
    </div>
  );
}
