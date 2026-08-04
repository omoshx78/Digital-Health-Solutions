import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Receipt, Printer, Plus } from "lucide-react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry, Patient, BillingItem } from "../types";
import { Card, Badge, ErrorBanner, money } from "../components/ui";
import { PatientPicker } from "../components/PatientPicker";

function CashierForm({ entry, onDone }: { entry: QueueEntry; onDone: () => void }) {
  const p = entry.encounter.patient!;
  const [items, setItems] = useState<BillingItem[]>(entry.encounter.billingItems || []);
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const [method, setMethod] = useState<"CASH" | "INSURANCE">(p.insuranceProvider ? "INSURANCE" : "CASH");
  const [provider, setProvider] = useState(p.insuranceProvider || "");
  const [claimNo, setClaimNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [addingCharge, setAddingCharge] = useState(false);

  const addCharge = async (e: FormEvent) => {
    e.preventDefault();
    if (!chargeDesc || !chargeAmount) return;
    setError(null);
    setAddingCharge(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/billing-items`, { description: chargeDesc, amount: Number(chargeAmount) });
      const fresh = await api.get(`/encounters/${entry.encounterId}`);
      setItems(fresh.billingItems || []);
      setChargeDesc("");
      setChargeAmount("");
      setShowAddCharge(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add charge");
    } finally {
      setAddingCharge(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/encounters/${entry.encounterId}/payment`, {
        method,
        insuranceProvider: method === "INSURANCE" ? provider : undefined,
        claimNo: method === "INSURANCE" ? claimNo : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-3">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <ErrorBanner message={error} />
      {(entry.encounter.notes || []).length > 0 && (
        <div className="mb-3 space-y-1">
          {entry.encounter.notes!.map((n) => (
            <p key={n.id} className="text-xs bg-slate-50 rounded-lg px-2.5 py-1.5"><span className="font-medium text-slate-600">{n.department}:</span> {n.note}</p>
          ))}
        </div>
      )}
      <table className="w-full text-sm mb-2">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-slate-100">
              <td className="py-1.5">{it.description}</td>
              <td className="py-1.5 text-right">{money(it.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="pt-2 font-medium">Total due</td>
            <td className="pt-2 font-semibold text-right">{money(total)}</td>
          </tr>
        </tbody>
      </table>

      {!showAddCharge ? (
        <button type="button" onClick={() => setShowAddCharge(true)} className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1 mb-3">
          <Plus size={12} /> Add a charge to this bill
        </button>
      ) : (
        <div className="flex gap-1.5 items-end mb-3 bg-slate-50 rounded-lg p-2.5">
          <label className="text-xs flex-1">Description
            <input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" placeholder="e.g. Supply fee" />
          </label>
          <label className="text-xs w-28">Amount (KSh)
            <input type="number" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
          </label>
          <button type="button" onClick={addCharge} disabled={addingCharge || !chargeDesc || !chargeAmount} className="text-xs bg-dhs-800 text-white rounded-lg py-1.5 px-3 hover:bg-dhs-900 disabled:opacity-50">
            {addingCharge ? "Adding..." : "Add"}
          </button>
          <button type="button" onClick={() => setShowAddCharge(false)} className="text-xs text-slate-400 hover:text-rose-600 px-1">Cancel</button>
        </div>
      )}

      <div className="flex gap-4 mb-3">
        <label className="text-sm flex items-center gap-1.5"><input type="radio" checked={method === "CASH"} onChange={() => setMethod("CASH")} /> Cash</label>
        <label className="text-sm flex items-center gap-1.5"><input type="radio" checked={method === "INSURANCE"} onChange={() => setMethod("INSURANCE")} /> Insurance</label>
      </div>
      {method === "INSURANCE" && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-sm">Insurance provider<input required value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <label className="text-sm">Claim / approval no.<input value={claimNo} onChange={(e) => setClaimNo(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <p className="col-span-2 text-xs text-slate-500 -mt-1">This submits a claim. It won't count as collected until it's marked "Paid" under Reports → Insurance claims.</p>
        </div>
      )}
      <button disabled={submitting} className="bg-dhs-800 text-white rounded-lg py-2.5 px-5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
        {submitting ? "Saving..." : method === "INSURANCE" ? "Submit claim & discharge patient" : "Confirm payment & discharge"}
      </button>
    </form>
  );
}

// ---------------- Look up any patient's payment history / receipts ----------------

const STATUS_BADGE: Record<string, string> = {
  DISCHARGED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  CASHIER: "bg-orange-100 text-orange-800 border-orange-300",
};

function PaymentLookup() {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (p: Patient) => {
    setSelectedPatient(p);
    setError(null);
    try {
      setDetail(await api.get(`/patients/${p.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this patient's records");
    }
  };

  const billedEncounters = (detail?.encounters || []).filter((e: any) => (e.billingItems || []).length > 0);

  return (
    <Card className="mt-5">
      <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><Receipt size={15} /> Look up a patient's payment / receipt</p>
      <ErrorBanner message={error} />
      {!selectedPatient ? (
        <PatientPicker onSelect={pick} placeholder="Search by name, MRN, phone, or ID number..." />
      ) : (
        <div>
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 mb-3">
            <span className="text-sm">{selectedPatient.firstName} {selectedPatient.lastName} ({selectedPatient.mrn})</span>
            <button onClick={() => { setSelectedPatient(null); setDetail(null); }} className="text-xs text-slate-400 hover:text-rose-600">Change</button>
          </div>
          {!detail ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : billedEncounters.length === 0 ? (
            <p className="text-sm text-slate-400">No billed visits found for this patient.</p>
          ) : (
            <ul className="space-y-2">
              {billedEncounters.map((enc: any) => {
                const total = enc.billingItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
                return (
                  <li key={enc.id} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span>{new Date(enc.registeredAt).toLocaleDateString()} — {enc.type}</span>
                      <Badge className={STATUS_BADGE[enc.status] || "bg-slate-100 text-slate-700 border-slate-300"}>{enc.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Total {money(total)} —{" "}
                      {enc.payment
                        ? enc.payment.method === "CASH"
                          ? `Paid in cash${enc.payment.paidAt ? ` on ${new Date(enc.payment.paidAt).toLocaleDateString()}` : ""}`
                          : enc.payment.claimStatus === "PARTIALLY_PAID"
                          ? `Insurance (${enc.payment.insuranceProvider || "—"}) — partially paid, ${money(total - Number(enc.payment.amountPaid))} remaining`
                          : `Insurance (${enc.payment.insuranceProvider || "—"}) — claim #${enc.payment.claimNo || "—"} — ${enc.payment.claimStatus}`
                        : "Not yet paid"}
                    </p>
                    <Link to={`/print/${enc.id}?type=receipt`} target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1 mt-1.5">
                      <Printer size={12} /> View / print receipt
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Cashier() {
  return (
    <div>
      <QueueBoard
        department="CASHIER"
        title="Cashier"
        subtitle="Generate invoice and capture payment"
        renderAction={(entry, onDone) => <CashierForm entry={entry} onDone={onDone} />}
      />
      <PaymentLookup />
    </div>
  );
}
