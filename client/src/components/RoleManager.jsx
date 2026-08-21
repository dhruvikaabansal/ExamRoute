import { useState } from 'react';
import api from '../api/client';

const ROLES = [
  { value: 'conductor', label: 'Conductor — can scan tickets and board passengers' },
  { value: 'student', label: 'Student — the default' },
  { value: 'admin', label: 'Admin — full access, including routing' },
];

/**
 * Appointing conductors.
 *
 * The endpoint and the role checks existed, and the README described this as
 * something the admin could do, but nothing in the app ever called it — so
 * in practice the only way to board a passenger was to be an admin, which is
 * exactly the concentration of access the role split exists to avoid.
 *
 * Boarding needs `conductor`, not `admin`: a conductor can scan a ticket and
 * check an admit card, and cannot run routing or read the booking list.
 */
export default function RoleManager() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('conductor');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim()) return;

    setBusy(true);
    setResult(null);
    try {
      const res = await api.patch('/admin/users/role', { email: email.trim(), role });
      setResult({
        ok: true,
        message: `${res.data.user.name || res.data.user.email} is now a ${res.data.user.role}.`,
      });
      setEmail('');
    } catch (err) {
      setResult({
        ok: false,
        message: err.response?.data?.message || 'Could not change that role',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border rounded-lg p-4 mb-6">
      <h3 className="font-medium">Staff roles</h3>
      <p className="text-sm text-slate-500 mt-1">
        Appoint a conductor so they can scan QR tickets and board passengers — without
        needing the admin login. They must have signed up already.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their@email.com"
          className="border rounded p-2 text-sm flex-1 min-w-[220px]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border rounded p-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.value}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="bg-brand text-white text-sm px-4 py-2 rounded hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Set role'}
        </button>
      </form>

      <p className="text-xs text-slate-400 mt-2">
        {ROLES.find((r) => r.value === role)?.label}
      </p>

      {result && (
        <p className={`text-sm mt-2 ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
