import { useState, FormEvent } from "react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { ErrorBanner } from "../components/ui";
import { NoteBox } from "../components/NoteBox";

function LabForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const pendingOrders = (entry.encounter.labOrders || []).filter((o) => o.status === "PENDING");
  const [results, setResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/lab-results`, {
        results: pendingOrders.map((o) => ({ labOrderId: o.id, result: results[o.id] || "" })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save results");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-3">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <ErrorBanner message={error} />
      <div className="space-y-3">
        {pendingOrders.map((o) => (
          <label key={o.id} className="text-sm block">
            {o.testName}
            <input
              required
              value={results[o.id] || ""}
              onChange={(e) => setResults((r) => ({ ...r, [o.id]: e.target.value }))}
              placeholder="Enter result / findings"
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <button disabled={submitting} className="mt-4 bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Submit results"}
      </button>
      <NoteBox encounterId={entry.encounterId} existingNotes={entry.encounter.notes} />
    </form>
  );
}

export default function Laboratory() {
  return (
    <QueueBoard
      department="LABORATORY"
      title="Laboratory"
      subtitle="Enter results for ordered tests"
      renderAction={(entry, onDone) => <LabForm entry={entry} onDone={onDone} />}
    />
  );
}
