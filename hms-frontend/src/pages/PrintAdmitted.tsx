import { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import { PrintShell } from "../components/PrintShell";

export default function PrintAdmitted() {
  const [wards, setWards] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setWards(await api.get("/wards"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load ward list");
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  const admitted = wards.flatMap((w) =>
    w.beds
      .filter((b: any) => b.admissions?.[0])
      .map((b: any) => ({ ward: w.name, bed: b.bedNumber, admission: b.admissions[0] }))
  );

  return (
    <PrintShell title="Admitted Patients" subtitle={`${admitted.length} patient(s) currently admitted`} backTo="/wards" backLabel="Back to Wards">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Ward / Bed</th><th className="font-normal">Diagnosis</th><th className="font-normal">Admitted</th>
          </tr>
        </thead>
        <tbody>
          {admitted.map(({ ward, bed, admission }) => (
            <tr key={admission.id} className="border-b border-slate-100">
              <td className="py-1.5">{admission.encounter.patient.firstName} {admission.encounter.patient.lastName} ({admission.encounter.patient.mrn})</td>
              <td className="text-slate-500">{ward} — Bed {bed}</td>
              <td className="text-slate-500">{admission.admittingDiagnosis || "—"}</td>
              <td className="text-slate-500">{new Date(admission.admittedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {admitted.length === 0 && <p className="text-sm text-slate-400">No patients currently admitted.</p>}
    </PrintShell>
  );
}
