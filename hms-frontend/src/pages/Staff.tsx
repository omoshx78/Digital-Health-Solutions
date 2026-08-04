import { useState, useEffect, FormEvent } from "react";
import { Link } from "react-router-dom";
import { UserPlus, KeyRound, ShieldCheck, Search, Printer } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner } from "../components/ui";
import { Role } from "../types";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
}

const STAFF_ROLES: Role[] = ["RECEPTIONIST", "NURSE", "DOCTOR", "LAB_TECH", "PHARMACIST", "CASHIER", "WARD_NURSE", "THEATRE_NURSE"];
// New staff accounts can never be created as Admin from this form — admin
// rights should only ever be granted deliberately, by promoting an
// existing account via the role dropdown below (which requires a
// confirmation and can't be used on your own account).
const CREATE_ROLES: Role[] = STAFF_ROLES;

function lastSeenLabel(lastLoginAt?: string | null): { text: string; active: boolean } {
  if (!lastLoginAt) return { text: "Never logged in", active: false };
  const minsAgo = (Date.now() - new Date(lastLoginAt).getTime()) / 60000;
  // Heuristic only — JWTs are stateless, so this is "logged in within the
  // last 15 minutes," not a real-time session tracker.
  if (minsAgo < 15) return { text: "Active now", active: true };
  return { text: `Last seen ${new Date(lastLoginAt).toLocaleString()}`, active: false };
}

export default function Staff() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "RECEPTIONIST" as Role });
  const [submitting, setSubmitting] = useState(false);

  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const load = async () => {
    try {
      setUsers(await api.get("/auth/users"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load staff list");
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await api.post("/auth/users", form);
      setForm({ name: "", email: "", password: "", role: "RECEPTIONIST" });
      setShowAdd(false);
      setSuccess(`${form.name} added as ${form.role}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user");
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (id: string, role: Role, name: string) => {
    if (!window.confirm(`Change ${name}'s role to ${role}?`)) return;
    setError(null);
    try {
      await api.patch(`/auth/users/${id}`, { role });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update role");
    }
  };

  const toggleActive = async (u: StaffUser) => {
    setError(null);
    try {
      await api.patch(`/auth/users/${u.id}`, { active: !u.active });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update status");
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget || resetPassword.length < 8) return;
    setError(null);
    try {
      await api.post(`/auth/users/${resetTarget.id}/reset-password`, { newPassword: resetPassword });
      setSuccess(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
    }
  };

  return (
    <div>
      <SectionHeader
        title="Staff"
        subtitle="Manage staff accounts, roles, and passwords"
        action={
          <div className="flex gap-2">
            <Link to="/print/staff" target="_blank" className="border border-slate-300 text-slate-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Printer size={15} /> Print roster
            </Link>
            <button onClick={() => setShowAdd((s) => !s)} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5"><UserPlus size={15} /> Add staff</button>
          </div>
        }
      />
      <ErrorBanner message={error} />
      {success && <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{success}</div>}

      {showAdd && (
        <Card className="mb-4">
          <form onSubmit={submitAdd} className="grid grid-cols-4 gap-2.5 items-end">
            <label className="text-sm">Name<input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Email<input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Temporary password<input required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="min. 8 characters" /></label>
            <label className="text-sm">Role
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {CREATE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button disabled={submitting} className="col-span-4 mt-1 bg-dhs-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
              {submitting ? "Creating..." : "Create account"}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-2">Share this temporary password with the staff member directly — they should change it via "Change password" after logging in.</p>
        </Card>
      )}

      {resetTarget && (
        <Card className="mb-4">
          <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><KeyRound size={15} /> Reset password for {resetTarget.name}</p>
          <form onSubmit={submitReset} className="flex gap-2 items-end">
            <label className="text-sm flex-1">New password
              <input required minLength={8} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="min. 8 characters" />
            </label>
            <button className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900">Set password</button>
            <button type="button" onClick={() => { setResetTarget(null); setResetPassword(""); }} className="text-sm text-slate-400 hover:text-slate-700 px-2">Cancel</button>
          </form>
        </Card>
      )}

      <Card className="mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or role..." className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm" />
        </div>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-normal">Name</th><th className="font-normal">Email</th><th className="font-normal">Role</th><th className="font-normal">Status</th><th className="font-normal">Last seen</th><th className="font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const seen = lastSeenLabel(u.lastLoginAt);
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 flex items-center gap-1.5">{u.name} {u.role === "ADMIN" && <ShieldCheck size={13} className="text-dhs-700" />}</td>
                  <td className="text-slate-500">{u.email}</td>
                  <td>
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value as Role, u.name)} className="text-xs border border-slate-300 rounded px-2 py-1">
                      <optgroup label="Staff roles">
                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </optgroup>
                      <optgroup label="⚠ Admin">
                        <option value="ADMIN">ADMIN</option>
                      </optgroup>
                    </select>
                  </td>
                  <td>
                    <Badge className={u.active ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-500 border-slate-300"}>
                      {u.active ? "Active" : "Deactivated"}
                    </Badge>
                  </td>
                  <td>
                    <span className={seen.active ? "text-emerald-700 text-xs font-medium" : "text-slate-400 text-xs"}>{seen.text}</span>
                  </td>
                  <td className="space-x-3">
                    <button onClick={() => setResetTarget(u)} className="text-xs text-dhs-700 hover:underline">Reset password</button>
                    <button onClick={() => toggleActive(u)} className="text-xs text-slate-500 hover:underline">{u.active ? "Deactivate" : "Reactivate"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
