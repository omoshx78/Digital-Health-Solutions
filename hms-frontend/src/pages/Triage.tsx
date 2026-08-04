import { useState, FormEvent } from "react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { ErrorBanner } from "../components/ui";

function TriageForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const [form, setForm] = useState({ bp: "", temp: "", pulse: "", spo2: "", weight: "", priority: "NORMAL", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const p = entry.encounter.patient!;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/triage`, {
        bp: form.bp || undefined,
        temp: form.temp ? Number(form.temp) : undefined,
        pulse: form.pulse ? Number(form.pulse) : undefined,
        spo2: form.spo2 ? Number(form.spo2) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        priority: form.priority,
        notes: form.notes || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save triage");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-3">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">Blood pressure<input value={form.bp} onChange={(e) => setForm((f) => ({ ...f, bp: e.target.value }))} placeholder="120/80" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-sm">Temp (°C)<input type="number" step="0.1" value={form.temp} onChange={(e) => setForm((f) => ({ ...f, temp: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-sm">Pulse (bpm)<input type="number" value={form.pulse} onChange={(e) => setForm((f) => ({ ...f, pulse: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-sm">SpO2 (%)<input type="number" value={form.spo2} onChange={(e) => setForm((f) => ({ ...f, spo2: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-sm">Weight (kg)<input type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
        <label className="text-sm">Priority
          <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </label>
      </div>
      <label className="text-sm block mt-3">Notes
        <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </label>
      <button disabled={submitting} className="mt-4 bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Send to consultation"}
      </button>
    </form>
  );
}

export default function Triage() {
  return (
    <QueueBoard
      department="TRIAGE"
      title="Triage"
      subtitle="Record vitals and set priority"
      renderAction={(entry, onDone) => <TriageForm entry={entry} onDone={onDone} />}
    />
  );
}
