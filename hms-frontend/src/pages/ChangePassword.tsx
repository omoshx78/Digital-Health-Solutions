import { useState, FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, ErrorBanner } from "../components/ui";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== confirm) {
      setError("New password and confirmation don't match");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch("/auth/me/password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Change password" subtitle="Update the password for your own account" />
      <Card className="max-w-md">
        <p className="text-sm font-medium mb-3 flex items-center gap-1.5"><KeyRound size={15} /> Update password</p>
        <ErrorBanner message={error} />
        {success && <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">Password updated.</div>}
        <form onSubmit={submit} className="space-y-3">
          <label className="text-sm block">Current password
            <input required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-sm block">New password
            <input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="text-sm block">Confirm new password
            <input required type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <button disabled={submitting} className="bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
            {submitting ? "Saving..." : "Update password"}
          </button>
        </form>
      </Card>
    </div>
  );
}
