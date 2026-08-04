import { useState, useEffect, FormEvent } from "react";
import { Plus, Trash2, Inbox } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner, money } from "../components/ui";
import { Patient } from "../types";
import { PatientPicker } from "../components/PatientPicker";

interface Equipment { id: string; name: string; type: string; feeItems: { label: string; defaultAmount: string }[]; }
interface FeeItem { label: string; amount: number; }

export default function Theatre() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const [equipmentId, setEquipmentId] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [encounterId, setEncounterId] = useState("");
  const [time, setTime] = useState("09:00");
  const [durationMin, setDurationMin] = useState(60);
  const [purpose, setPurpose] = useState("");
  const [items, setItems] = useState<FeeItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const loadEquipment = async () => {
    const eq = await api.get("/theatre/equipment");
    setEquipment(eq);
    if (eq.length > 0) {
      setEquipmentId(eq[0].id);
      setItems(eq[0].feeItems.map((fi: any) => ({ label: fi.label, amount: Number(fi.defaultAmount) })));
    }
  };

  const loadBookings = async () => {
    try {
      const b = await api.get(`/theatre/bookings?date=${date}`);
      setBookings(b);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load bookings");
    }
  };

  const loadReferrals = async () => {
    try {
      const [queue, allBookings] = await Promise.all([api.get("/queue/THEATRE"), api.get("/theatre/bookings")]);
      const scheduledEncounterIds = new Set(
        allBookings.filter((b: any) => b.status !== "Cancelled" && b.encounterId).map((b: any) => b.encounterId)
      );
      setReferrals(queue.waiting.filter((r: any) => !scheduledEncounterIds.has(r.encounterId)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load theatre referrals");
    }
  };

  useEffect(() => { loadEquipment(); loadReferrals(); }, []);
  useEffect(() => { loadBookings(); }, [date]);

  const scheduleReferral = (r: any) => {
    setSelectedPatient(r.encounter.patient);
    setEncounterId(r.encounterId);
  };

  const changeEquipment = (id: string) => {
    setEquipmentId(id);
    const eq = equipment.find((e) => e.id === id);
    setItems(eq ? eq.feeItems.map((fi) => ({ label: fi.label, amount: Number(fi.defaultAmount) })) : []);
  };

  const pickPatient = async (p: Patient) => {
    setSelectedPatient(p);
    const full = await api.get(`/patients/${p.id}`);
    const active = (full.encounters || []).find((e: any) => e.status !== "DISCHARGED");
    setEncounterId(active ? active.id : "");
  };

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/theatre/bookings", {
        equipmentId,
        encounterId: encounterId || undefined,
        date: new Date(date).toISOString(),
        time,
        durationMin,
        purpose: purpose || undefined,
        items,
      });
      setPurpose("");
      setSelectedPatient(null);
      setEncounterId("");
      await loadBookings();
      await loadReferrals();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create booking");
    } finally {
      setSubmitting(false);
    }
  };

  const claim = async (id: string) => {
    try {
      await api.post(`/theatre/bookings/${id}/claim`);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not claim this case");
    }
  };
  const [completingId, setCompletingId] = useState<string | null>(null);
  const confirmComplete = async (id: string, decision: "WARD" | "CASHIER") => {
    try {
      await api.post(`/theatre/bookings/${id}/complete`, { decision });
      setCompletingId(null);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not complete this case");
    }
  };
  const cancel = async (id: string) => {
    await api.post(`/theatre/bookings/${id}/cancel`);
    await loadBookings();
    await loadReferrals();
  };

  return (
    <div>
      <SectionHeader title="Theatre & equipment" subtitle="Book operating theatres, imaging machines and diagnostic equipment" />
      <ErrorBanner message={error} />

      {referrals.length > 0 && (
        <Card className="mb-5">
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><Inbox size={15} /> Referrals awaiting scheduling ({referrals.length})</p>
          <ul className="space-y-1.5">
            {referrals.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                <span>{r.encounter.patient.firstName} {r.encounter.patient.lastName} ({r.encounter.patient.mrn})</span>
                <button onClick={() => scheduleReferral(r)} className="text-xs bg-dhs-800 text-white rounded px-2 py-1 hover:bg-dhs-900">Schedule →</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-5 mb-5">
        <Card>
          <p className="font-medium text-sm mb-3">New booking</p>
          <form onSubmit={submit} className="space-y-2.5">
            <label className="text-sm block">Equipment / theatre
              <select value={equipmentId} onChange={(e) => changeEquipment(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
              </select>
            </label>

            <label className="text-sm block">Patient (optional — leave blank for unassigned block)</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                <span>{selectedPatient.firstName} {selectedPatient.lastName} ({selectedPatient.mrn})</span>
                <button type="button" onClick={() => { setSelectedPatient(null); setEncounterId(""); }} className="text-xs text-slate-400 hover:text-rose-600">Clear</button>
              </div>
            ) : (
              <div>
                <PatientPicker onSelect={pickPatient} />
              </div>
            )}
            {selectedPatient && !encounterId && (
              <p className="text-xs text-amber-700">This patient has no active visit — the booking will be saved without a charge/queue link.</p>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-sm block">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="text-sm block">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            </div>
            <label className="text-sm block">Duration (min)<input type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm block">Purpose<input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Appendectomy, chest X-ray" /></label>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Itemized fees</p>
                <button type="button" onClick={() => setItems((it) => [...it, { label: "Additional fee", amount: 0 }])} className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-0.5"><Plus size={12} /> Line item</button>
              </div>
              <div className="space-y-1.5 mt-1.5">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input value={it.label} onChange={(e) => setItems((all) => all.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} className="flex-1 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <input type="number" value={it.amount} onChange={(e) => setItems((all) => all.map((x, i) => i === idx ? { ...x, amount: Number(e.target.value) } : x))} className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-xs" />
                    <button type="button" onClick={() => setItems((all) => all.filter((_, i) => i !== idx))}><Trash2 size={14} className="text-slate-400 hover:text-rose-600" /></button>
                  </div>
                ))}
              </div>
            </div>
            {encounterId && <p className="text-xs text-slate-500">Total {money(total)} will be added to this patient's bill when the case is completed.</p>}
            <button disabled={submitting} className="w-full bg-dhs-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"><Plus size={15} /> Add booking</button>
          </form>
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">Schedule</p>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-xs" />
          </div>
          {(() => {
            const active = bookings.filter((b: any) => b.status !== "Completed" && b.status !== "Cancelled");
            const finished = bookings.filter((b: any) => b.status === "Completed" || b.status === "Cancelled");
            return (
              <>
                {active.length === 0 ? (
                  <p className="text-sm text-slate-400">No active bookings for this date.</p>
                ) : (
                  <ul className="space-y-2 max-h-[420px] overflow-auto">
                    {active.map((b: any) => (
                      <li key={b.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{b.equipment.name} · {b.time}</p>
                            <p className="text-xs text-slate-500">{b.encounter?.patient ? `${b.encounter.patient.firstName} ${b.encounter.patient.lastName} (${b.encounter.patient.mrn})` : "Unassigned"} — {b.purpose || "No purpose noted"}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{money(b.charges.reduce((s: number, c: any) => s + Number(c.amount), 0))} · {b.charges.length} item(s)</p>
                          </div>
                          <Badge className="bg-slate-100 text-slate-700 border-slate-300">{b.status}</Badge>
                        </div>
                        {b.encounterId && (
                          <div className="mt-2">
                            {b.status === "Scheduled" && <button onClick={() => claim(b.id)} className="text-xs bg-dhs-800 text-white rounded-lg py-1 px-3 hover:bg-dhs-900">Claim & start</button>}
                            {b.status === "In progress" && completingId !== b.id && (
                              <button onClick={() => setCompletingId(b.id)} className="text-xs bg-emerald-700 text-white rounded-lg py-1 px-3 hover:bg-emerald-800">Complete & bill</button>
                            )}
                            {b.status === "In progress" && completingId === b.id && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Send patient to:</span>
                                <button onClick={() => confirmComplete(b.id, "WARD")} className="text-xs bg-indigo-700 text-white rounded-lg py-1 px-2.5 hover:bg-indigo-800">Ward (recovery)</button>
                                <button onClick={() => confirmComplete(b.id, "CASHIER")} className="text-xs bg-orange-700 text-white rounded-lg py-1 px-2.5 hover:bg-orange-800">Cashier (discharge)</button>
                                <button onClick={() => setCompletingId(null)} className="text-xs text-slate-400 hover:text-rose-600">Back</button>
                              </div>
                            )}
                            {b.status !== "In progress" && <button onClick={() => cancel(b.id)} className="text-xs text-slate-400 hover:text-rose-600 ml-3">Cancel</button>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {finished.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Completed / cancelled ({finished.length}) — click to show</summary>
                    <ul className="space-y-2 mt-2 max-h-[300px] overflow-auto">
                      {finished.map((b: any) => (
                        <li key={b.id} className="border border-slate-100 rounded-lg px-3 py-2 text-sm bg-slate-50">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-slate-600">{b.equipment.name} · {b.time}</p>
                              <p className="text-xs text-slate-400">{b.encounter?.patient ? `${b.encounter.patient.firstName} ${b.encounter.patient.lastName} (${b.encounter.patient.mrn})` : "Unassigned"} — {b.purpose || "No purpose noted"}</p>
                            </div>
                            <Badge className={b.status === "Completed" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-200 text-slate-500 border-slate-300"}>{b.status}</Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            );
          })()}
        </Card>
      </div>
    </div>
  );
}
