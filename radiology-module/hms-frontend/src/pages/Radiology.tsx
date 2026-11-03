import { useState, useEffect, FormEvent, useCallback } from "react";
import { Link } from "react-router-dom";
import { Printer, ScanLine } from "lucide-react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { Card, ErrorBanner, money } from "../components/ui";
import { NoteBox } from "../components/NoteBox";

function RadiologyForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const enc = entry.encounter;
  const p = enc.patient!;
  const pending = (enc.radiologyOrders || []).filter((o) => o.status === "PENDING");
  const [findings, setFindings] = useState<Record<string, string>>({});
  const [impressions, setImpressions] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = pending.reduce((s, o) => s + Number(o.price), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/radiology/${entry.encounterId}/complete`, {
        results: pending.map((o) => ({
          orderId: o.id,
          findings: findings[o.id] || "",
          impression: impressions[o.id] || undefined,
        })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-1">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <div className="text-xs text-slate-500 mb-3 space-y-0.5">
        <p>{p.gender}{p.phone ? ` · ${p.phone}` : ""}</p>
        <p><span className="font-medium text-slate-600">Referred by:</span> {enc.referringFacility || "—"}{enc.referringClinician ? ` (${enc.referringClinician})` : ""}</p>
        {enc.chiefComplaint && <p><span className="font-medium text-slate-600">Clinical information:</span> {enc.chiefComplaint}</p>}
      </div>
      <ErrorBanner message={error} />

      <div className="space-y-4">
        {pending.map((o) => (
          <div key={o.id} className="border border-slate-200 rounded-lg p-3">
            <p className="text-sm font-medium mb-2 flex justify-between"><span>{o.examName}</span><span className="text-slate-500 font-normal">{money(o.price)}</span></p>
            <label className="text-xs text-slate-600 block mb-2">Findings
              <textarea
                required
                rows={4}
                value={findings[o.id] || ""}
                onChange={(e) => setFindings((f) => ({ ...f, [o.id]: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Describe what the images show"
              />
            </label>
            <label className="text-xs text-slate-600 block">Impression / conclusion (optional)
              <input
                value={impressions[o.id] || ""}
                onChange={(e) => setImpressions((f) => ({ ...f, [o.id]: e.target.value }))}
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
        ))}
        {pending.length === 0 && <p className="text-sm text-slate-400">No pending examinations on this visit.</p>}
      </div>

      <p className="text-xs text-slate-500 mt-3">Completing this bills {money(total)} and releases the patient to Reception for payment clearance.</p>
      <button disabled={submitting || pending.length === 0} className="mt-3 bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Complete & release to Reception"}
      </button>
      <NoteBox encounterId={entry.encounterId} existingNotes={enc.notes} />
    </form>
  );
}

function RecentReports() {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => {
    try {
      setRows(await api.get("/radiology/recent"));
    } catch {
      // non-critical
    }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card className="mt-5">
      <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><ScanLine size={15} /> Reports from the last 7 days</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No completed radiology reports yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{r.patient.firstName} {r.patient.lastName}</span>
                <span className="text-xs text-slate-500 ml-2">{r.patient.mrn} · {(r.radiologyOrders || []).map((o: any) => o.examName).join(", ")}</span>
                {r.referringFacility && <p className="text-xs text-slate-400">Referred by {r.referringFacility}</p>}
              </div>
              <Link to={`/print/${r.id}?type=radiology`} target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1">
                <Printer size={12} /> Print report
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Radiology() {
  return (
    <div>
      <QueueBoard
        department="RADIOLOGY"
        title="Radiology"
        subtitle="Patients referred from other clinics — perform the exam, record findings, then release to Reception for payment"
        waitingDetail={(e) => `${e.encounter.referringFacility || "Referral"} · ${(e.encounter.radiologyOrders || []).filter((o) => o.status === "PENDING").map((o) => o.examName).join(", ") || "No exams"}`}
        renderAction={(entry, onDone) => <RadiologyForm entry={entry} onDone={onDone} />}
      />
      <RecentReports />
    </div>
  );
}
