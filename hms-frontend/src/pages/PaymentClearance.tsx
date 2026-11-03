import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Printer, CheckCircle2 } from "lucide-react";
import { QueueBoard } from "../components/QueueBoard";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { ErrorBanner, money } from "../components/ui";

function ClearanceForm({ entry, onDone }: { entry: QueueEntry; onDone: (cleared: { encounterId: string; name: string }) => void }) {
  const enc = entry.encounter;
  const p = enc.patient!;
  const items = enc.billingItems || [];
  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  const [method, setMethod] = useState<"CASH" | "INSURANCE">(p.insuranceProvider ? "INSURANCE" : "CASH");
  const [provider, setProvider] = useState(p.insuranceProvider || "");
  const [claimNo, setClaimNo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/radiology/${entry.encounterId}/clearance`, {
        method,
        insuranceProvider: method === "INSURANCE" ? provider : undefined,
        claimNo: method === "INSURANCE" ? claimNo : undefined,
      });
      onDone({ encounterId: entry.encounterId, name: `${p.firstName} ${p.lastName}` });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <p className="font-medium mb-1">{p.firstName} {p.lastName} <span className="text-slate-400 font-normal text-sm">({p.mrn})</span></p>
      <p className="text-xs text-slate-500 mb-3">Referred by {enc.referringFacility || "—"}. Radiology is complete — settle the bill to close the visit.</p>
      <ErrorBanner message={error} />
      <table className="w-full text-sm mb-3">
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
        {submitting ? "Saving..." : method === "INSURANCE" ? "Submit claim & clear patient" : "Confirm payment & clear patient"}
      </button>
    </form>
  );
}

export default function PaymentClearance() {
  const [cleared, setCleared] = useState<{ encounterId: string; name: string } | null>(null);

  return (
    <div>
      {cleared && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} /> {cleared.name} cleared.</span>
          <span className="inline-flex gap-4">
            <Link to={`/print/${cleared.encounterId}?type=receipt`} target="_blank" className="hover:underline inline-flex items-center gap-1"><Printer size={13} /> Receipt</Link>
            <Link to={`/print/${cleared.encounterId}?type=radiology`} target="_blank" className="hover:underline inline-flex items-center gap-1"><Printer size={13} /> Radiology report</Link>
          </span>
        </div>
      )}
      <QueueBoard
        department="RECEPTION"
        title="Payment clearance"
        subtitle="Patients released by Radiology — settle the bill before they leave"
        waitingDetail={(e) => `${e.encounter.referringFacility || "Referral"} · ${(e.encounter.radiologyOrders || []).map((o) => o.examName).join(", ")}`}
        renderAction={(entry, onDone) => (
          <ClearanceForm
            entry={entry}
            onDone={(c) => {
              setCleared(c);
              onDone();
            }}
          />
        )}
      />
    </div>
  );
}
