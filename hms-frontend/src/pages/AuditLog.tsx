import { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner } from "../components/ui";

const ACTION_COLORS: Record<string, string> = {
  "auth.login": "bg-slate-100 text-slate-700 border-slate-300",
  "user.created": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "user.updated": "bg-amber-100 text-amber-800 border-amber-300",
  "user.password_reset": "bg-rose-100 text-rose-800 border-rose-300",
  "encounter.force_cancelled": "bg-rose-100 text-rose-800 border-rose-300",
};

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async (action?: string) => {
    try {
      setLogs(await api.get(`/auth/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load audit log");
    }
  };
  useEffect(() => { load(); }, []);

  const applyFilter = () => load(filter || undefined);

  return (
    <div>
      <SectionHeader title="Audit log" subtitle="Logins, staff changes, and other sensitive actions — most recent 200" />
      <ErrorBanner message={error} />
      <Card className="mb-4">
        <div className="flex gap-1.5">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilter()}
            placeholder="Filter by action (e.g. login, user, charge, encounter)..."
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={applyFilter} className="text-sm bg-slate-800 text-white rounded-lg px-4 hover:bg-slate-900">Filter</button>
          {filter && <button onClick={() => { setFilter(""); load(); }} className="text-sm text-slate-400 hover:text-slate-700 px-2">Clear</button>}
        </div>
      </Card>
      <Card>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">No matching log entries.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 font-normal">When</th><th className="font-normal">Who</th><th className="font-normal">Action</th><th className="font-normal">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-2 text-slate-500 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="text-slate-700">{l.user ? `${l.user.name} (${l.user.role})` : <span className="text-slate-400">System</span>}</td>
                  <td><Badge className={ACTION_COLORS[l.action] || "bg-slate-100 text-slate-700 border-slate-300"}>{l.action}</Badge></td>
                  <td className="text-slate-500 max-w-md break-words">{l.details ? JSON.stringify(l.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
