import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { api, ApiError } from "../api/client";

export default function PrintStaffRoster() {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setUsers(await api.get("/auth/users"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load staff list");
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <Link to="/staff" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> Back to Staff
        </Link>
        <button onClick={() => window.print()} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>
      <div className="print-page max-w-3xl mx-auto bg-white shadow-sm my-6 p-10">
        <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
          <div>
            <img src="/logo.png" alt="Digital Health Solutions" className="h-8 w-auto mb-1" />
            <p className="text-sm text-slate-500">Staff Roster</p>
          </div>
          <p className="text-xs text-slate-500">Generated: {new Date().toLocaleString()}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-300">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Email</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-2">{u.name}</td>
                <td className="py-2 text-slate-600">{u.email}</td>
                <td className="py-2 text-slate-600">{u.role}</td>
                <td className="py-2 text-slate-600">{u.active ? "Active" : "Deactivated"}</td>
                <td className="py-2 text-slate-600">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-6">{users.length} staff account(s) total.</p>
      </div>
    </div>
  );
}
