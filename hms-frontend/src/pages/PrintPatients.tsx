import { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import { PrintShell } from "../components/PrintShell";

export default function PrintPatients() {
  const [patients, setPatients] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setPatients(await api.get("/patients?take=2000"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load patient list");
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  return (
    <PrintShell title="Patient List" subtitle="All registered patients, most recent first" backTo="/patients" backLabel="Back to Patients">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-1.5 font-normal">Name</th><th className="font-normal">MRN</th><th className="font-normal">Gender</th><th className="font-normal">Phone</th><th className="font-normal">National ID</th><th className="font-normal">Registered</th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="py-1.5">{p.firstName} {p.lastName}</td>
              <td className="text-slate-500">{p.mrn}</td>
              <td className="text-slate-500">{p.gender}</td>
              <td className="text-slate-500">{p.phone || "—"}</td>
              <td className="text-slate-500">{p.nationalId || "—"}</td>
              <td className="text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 mt-4">{patients.length} patient(s) total.</p>
    </PrintShell>
  );
}
