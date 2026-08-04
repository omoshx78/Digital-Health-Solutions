import { useState, useEffect, FormEvent } from "react";
import { Trash2, FlaskConical, Pill, BedDouble, Scissors, LogOut as DischargeIcon } from "lucide-react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry, InventoryItem } from "../types";
import { ErrorBanner, money } from "../components/ui";
import { NoteBox } from "../components/NoteBox";

interface LabTest { id: string; name: string; price: number; }
type InitialDecision = "LAB" | "PHARMACY" | "THEATRE" | "DISCHARGE";

// ---------------- Initial consultation (first time seeing the patient) ----------------

function ConsultationForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [labTestsError, setLabTestsError] = useState<string | null>(null);
  const [medicines, setMedicines] = useState<InventoryItem[]>([]);
  const [medicinesError, setMedicinesError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<InitialDecision | null>(null);
  const [selectedLabIds, setSelectedLabIds] = useState<string[]>([]);
  const [prescriptions, setPrescriptions] = useState<{ itemId: string; name: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadLabTests = () => {
    setLabTestsError(null);
    api.get("/charges?category=Laboratory")
      .then((items) => setLabTests(items.map((i: any) => ({ id: i.id, name: i.name, price: Number(i.price) }))))
      .catch((err) => setLabTestsError(err instanceof ApiError ? err.message : "Could not load lab tests"));
  };
  const loadMedicines = () => {
    setMedicinesError(null);
    api.get("/inventory?category=Medicine")
      .then((inventory) => setMedicines(inventory))
      .catch((err) => setMedicinesError(err instanceof ApiError ? err.message : "Could not load medicines"));
  };

  useEffect(() => {
    loadLabTests();
    loadMedicines();
  }, []);

  const toggleLab = (id: string) => {
    setSelectedLabIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const addRx = (itemId: string) => {
    if (!itemId || prescriptions.find((r) => r.itemId === itemId)) return;
    const item = medicines.find((m) => m.id === itemId);
    if (!item) return;
    setPrescriptions((rx) => [...rx, { itemId, name: item.name, qty: 1 }]);
  };

  const canSubmit =
    decision === "LAB" ? selectedLabIds.length > 0 :
    decision === "PHARMACY" ? prescriptions.length > 0 :
    decision === "THEATRE" || decision === "DISCHARGE";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!decision || !canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/consultation`, {
        diagnosis: diagnosis || undefined,
        notes: notes || undefined,
        labTestIds: decision === "LAB" ? selectedLabIds : [],
        prescriptions: decision === "PHARMACY" ? prescriptions.map((r) => ({ itemId: r.itemId, quantity: r.qty })) : [],
        decision: decision === "THEATRE" || decision === "DISCHARGE" ? decision : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save consultation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-1">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      {entry.encounter.triage && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-xs text-slate-600">
            Vitals: BP {entry.encounter.triage.bp || "—"} · Temp {entry.encounter.triage.temp ?? "—"}°C · Pulse {entry.encounter.triage.pulse ?? "—"} · SpO2 {entry.encounter.triage.spo2 ?? "—"}% · Priority <span className="font-medium">{entry.encounter.triage.priority}</span>
          </p>
          {entry.encounter.triage.notes && (
            <p className="text-xs text-slate-600 mt-1"><span className="font-medium">Triage notes:</span> {entry.encounter.triage.notes}</p>
          )}
        </div>
      )}
      <ErrorBanner message={error} />
      <label className="text-sm block">Diagnosis
        <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="text-sm block mt-3">Clinical notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </label>

      <p className="text-sm font-medium mt-4 mb-2">Where does this patient go next?</p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <button type="button" onClick={() => setDecision("LAB")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "LAB" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <FlaskConical size={16} /> Laboratory
        </button>
        <button type="button" onClick={() => setDecision("PHARMACY")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "PHARMACY" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <Pill size={16} /> Pharmacy
        </button>
        <button type="button" onClick={() => setDecision("THEATRE")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "THEATRE" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <Scissors size={16} /> Theatre
        </button>
        <button type="button" onClick={() => setDecision("DISCHARGE")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "DISCHARGE" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <DischargeIcon size={16} /> Discharge
        </button>
      </div>

      {decision === "LAB" && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Select lab tests</p>
          <div className="border border-slate-200 rounded-lg p-2.5">
            {labTestsError ? (
              <div className="flex items-center justify-between px-1 py-1">
                <p className="text-xs text-rose-600">{labTestsError}</p>
                <button type="button" onClick={loadLabTests} className="text-xs text-dhs-700 hover:underline">Retry</button>
              </div>
            ) : labTests.length === 0 ? (
              <p className="text-xs text-slate-400 px-1 py-1">Loading lab test list...</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {labTests.map((t) => (
                  <label key={t.id} className="text-xs flex items-center gap-2 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={selectedLabIds.includes(t.id)} onChange={() => toggleLab(t.id)} />
                    {t.name} <span className="text-slate-400">({money(t.price)})</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedLabIds.length === 0 && <p className="text-xs text-amber-700 mt-1.5">Select at least one test.</p>}
          <p className="text-xs text-slate-500 mt-2">Patient goes to Laboratory, then comes back to you here to review results.</p>
        </div>
      )}

      {decision === "PHARMACY" && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Prescribe medicines</p>
          {medicinesError ? (
            <div className="flex items-center justify-between border border-rose-200 bg-rose-50 rounded-lg px-3 py-2 mb-2">
              <p className="text-xs text-rose-600">{medicinesError}</p>
              <button type="button" onClick={loadMedicines} className="text-xs text-dhs-700 hover:underline">Retry</button>
            </div>
          ) : (
            <select onChange={(e) => { addRx(e.target.value); e.target.value = ""; }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" defaultValue="">
              <option value="" disabled>{medicines.length === 0 ? "Loading medicines..." : "Add medicine..."}</option>
              {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.quantity} {m.unit} in stock)</option>)}
            </select>
          )}
          {prescriptions.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {prescriptions.map((r) => (
                <li key={r.itemId} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                  <span className="flex-1">{r.name}</span>
                  <input
                    type="number"
                    value={r.qty}
                    onChange={(e) => setPrescriptions((rx) => rx.map((x) => (x.itemId === r.itemId ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))}
                    className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
                  />
                  <button type="button" onClick={() => setPrescriptions((rx) => rx.filter((x) => x.itemId !== r.itemId))}>
                    <Trash2 size={14} className="text-slate-400 hover:text-rose-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {prescriptions.length === 0 && <p className="text-xs text-amber-700">Add at least one medicine.</p>}
          <p className="text-xs text-slate-500 mt-2">Patient goes straight to Pharmacy to have this dispensed.</p>
        </div>
      )}

      {decision === "THEATRE" && (
        <p className="text-xs text-slate-500 mb-4">This sends the patient to the Theatre referral queue. Theatre staff will schedule the actual procedure (equipment, date/time, itemized fees).</p>
      )}
      {decision === "DISCHARGE" && (
        <p className="text-xs text-slate-500 mb-4">No lab or medication ordered — the patient goes straight to Cashier for the consultation fee only.</p>
      )}

      <button disabled={submitting || !decision || !canSubmit} className="bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Save consultation"}
      </button>
    </form>
  );
}

// ---------------- Review after lab results ----------------

function ReviewForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const completedLabs = (entry.encounter.labOrders || []).filter((o) => o.status === "COMPLETED");
  const priorConsultation = (entry.encounter.consultations || [])[0];
  const [medicines, setMedicines] = useState<InventoryItem[]>([]);
  const [medicinesError, setMedicinesError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"PHARMACY" | "WARD" | "THEATRE" | "DISCHARGE" | null>(null);
  const [notes, setNotes] = useState("");
  const [prescriptions, setPrescriptions] = useState<{ itemId: string; name: string; qty: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadMedicines = () => {
    setMedicinesError(null);
    api.get("/inventory?category=Medicine")
      .then(setMedicines)
      .catch((err) => setMedicinesError(err instanceof ApiError ? err.message : "Could not load medicines"));
  };

  useEffect(() => { loadMedicines(); }, []);

  const addRx = (itemId: string) => {
    if (!itemId || prescriptions.find((r) => r.itemId === itemId)) return;
    const item = medicines.find((m) => m.id === itemId);
    if (!item) return;
    setPrescriptions((rx) => [...rx, { itemId, name: item.name, qty: 1 }]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!decision) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/consultation-review`, {
        decision,
        notes: notes || undefined,
        prescriptions: decision === "PHARMACY" ? prescriptions.map((r) => ({ itemId: r.itemId, quantity: r.qty })) : [],
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save decision");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-1">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <p className="text-xs text-slate-500 mb-3">Reviewing lab results</p>
      <ErrorBanner message={error} />

      {(entry.encounter.triage?.notes || priorConsultation) && (
        <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
          {entry.encounter.triage?.notes && (
            <p className="text-xs text-slate-600"><span className="font-medium">Triage notes:</span> {entry.encounter.triage.notes}</p>
          )}
          {priorConsultation && (
            <p className="text-xs text-slate-600"><span className="font-medium">Initial diagnosis:</span> {priorConsultation.diagnosis || "—"}{priorConsultation.notes ? ` — ${priorConsultation.notes}` : ""}</p>
          )}
        </div>
      )}

      <div className="space-y-2 mb-4">
        {completedLabs.map((o) => (
          <div key={o.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <p className="font-medium">{o.testName}</p>
            <p className="text-slate-600">{o.result || "—"}</p>
          </div>
        ))}
        {completedLabs.length === 0 && <p className="text-sm text-slate-400">No completed lab results found for this visit.</p>}
      </div>

      <p className="text-sm font-medium mb-2">What next for this patient?</p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <button type="button" onClick={() => setDecision("PHARMACY")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "PHARMACY" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <Pill size={16} /> Send to pharmacy
        </button>
        <button type="button" onClick={() => setDecision("WARD")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "WARD" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <BedDouble size={16} /> Admit to ward
        </button>
        <button type="button" onClick={() => setDecision("THEATRE")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "THEATRE" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <Scissors size={16} /> Refer to theatre
        </button>
        <button type="button" onClick={() => setDecision("DISCHARGE")} className={`border rounded-lg px-3 py-2.5 text-sm flex flex-col items-center gap-1 ${decision === "DISCHARGE" ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <DischargeIcon size={16} /> Dismiss — no treatment needed
        </button>
      </div>

      {decision === "PHARMACY" && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Prescribe medicines</p>
          {medicinesError ? (
            <div className="flex items-center justify-between border border-rose-200 bg-rose-50 rounded-lg px-3 py-2 mb-2">
              <p className="text-xs text-rose-600">{medicinesError}</p>
              <button type="button" onClick={loadMedicines} className="text-xs text-dhs-700 hover:underline">Retry</button>
            </div>
          ) : (
            <select onChange={(e) => { addRx(e.target.value); e.target.value = ""; }} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" defaultValue="">
              <option value="" disabled>{medicines.length === 0 ? "Loading medicines..." : "Add medicine..."}</option>
              {medicines.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.quantity} {m.unit} in stock)</option>)}
            </select>
          )}
          {prescriptions.length > 0 && (
            <ul className="space-y-1.5">
              {prescriptions.map((r) => (
                <li key={r.itemId} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                  <span className="flex-1">{r.name}</span>
                  <input type="number" value={r.qty} onChange={(e) => setPrescriptions((rx) => rx.map((x) => (x.itemId === r.itemId ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} className="w-16 border border-slate-300 rounded px-2 py-1 text-xs" />
                  <button type="button" onClick={() => setPrescriptions((rx) => rx.filter((x) => x.itemId !== r.itemId))}><Trash2 size={14} className="text-slate-400 hover:text-rose-600" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {decision === "WARD" && (
        <p className="text-xs text-slate-500 mb-4">This sends the patient to the Wards referral queue. A ward nurse/doctor will claim them and assign a bed — no new charges are added here; ward stay is billed at discharge based on nights stayed.</p>
      )}
      {decision === "THEATRE" && (
        <p className="text-xs text-slate-500 mb-4">This sends the patient to the Theatre referral queue. Theatre staff will schedule the actual procedure (equipment, date/time, itemized fees) — those charges get added to the bill once the procedure is completed.</p>
      )}
      {decision === "DISCHARGE" && (
        <p className="text-xs text-slate-500 mb-4">No further treatment will be charged. The patient goes straight to Cashier for whatever was already billed (consultation + lab fees).</p>
      )}

      <label className="text-sm block mb-3">Notes (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" rows={2} />
      </label>

      <button disabled={submitting || !decision || (decision === "PHARMACY" && prescriptions.length === 0)} className="bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : "Confirm decision"}
      </button>
      <NoteBox encounterId={entry.encounterId} existingNotes={entry.encounter.notes} />
    </form>
  );
}

export default function Consultation() {
  return (
    <QueueBoard
      department="CONSULTATION"
      title="Consultation"
      subtitle="Doctor's assessment — lab, pharmacy, theatre, or discharge"
      renderAction={(entry, onDone) => {
        const hasCompletedLab = (entry.encounter.labOrders || []).some((o) => o.status === "COMPLETED");
        return hasCompletedLab ? <ReviewForm entry={entry} onDone={onDone} /> : <ConsultationForm entry={entry} onDone={onDone} />;
      }}
    />
  );
}
