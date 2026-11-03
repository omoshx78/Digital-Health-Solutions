import { useState, useEffect, ReactNode } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { api, ApiError } from "../api/client";
import { money } from "../components/ui";

type DocType = "summary" | "receipt" | "discharge" | "theatre" | "radiology";

const DOC_TITLES: Record<DocType, string> = {
  summary: "Medical Report",
  receipt: "Payment Receipt",
  discharge: "Discharge Summary",
  theatre: "Theatre Record",
  radiology: "Radiology Report",
};

export default function PrintView() {
  const { encounterId } = useParams();
  const [searchParams] = useSearchParams();
  const type = (searchParams.get("type") as DocType) || "summary";
  const [encounter, setEncounter] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setEncounter(await api.get(`/encounters/${encounterId}`));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load this record");
      }
    })();
  }, [encounterId]);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;
  if (!encounter) return <div className="p-8 text-sm text-slate-400">Loading...</div>;

  const p = encounter.patient;
  const total = (encounter.billingItems || []).reduce((s: number, i: any) => s + Number(i.amount), 0);
  const latestConsultation = (encounter.consultations || [])[encounter.consultations.length - 1];

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
        <Link to={type === "radiology" ? "/" : "/patients"} className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> {type === "radiology" ? "Back" : "Back to Patients"}
        </Link>
        <button onClick={() => window.print()} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      <div className="print-page max-w-3xl mx-auto bg-white shadow-sm my-6 p-10">
        <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
          <div>
            <img src="/logo.png" alt="Digital Health Solutions" className="h-8 w-auto mb-1" />
            <p className="text-sm text-slate-500">{DOC_TITLES[type]}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Visit ID: {encounter.id}</p>
            <p>Generated: {new Date().toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Patient</p>
            <p className="font-medium">{p.firstName} {p.lastName}</p>
            <p className="text-slate-600">{p.mrn} · {p.gender}{p.dob ? ` · DOB ${new Date(p.dob).toLocaleDateString()}` : ""}</p>
            <p className="text-slate-600">{p.phone || "No phone on file"}{p.nationalId ? ` · ID ${p.nationalId}` : ""}</p>
            {p.insuranceProvider && <p className="text-slate-600">Insurance: {p.insuranceProvider} {p.insuranceNo ? `(${p.insuranceNo})` : ""}</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Visit</p>
            <p className="text-slate-600">{encounter.type} · {encounter.status}</p>
            <p className="text-slate-600">Registered: {new Date(encounter.registeredAt).toLocaleString()}</p>
            {encounter.dischargedAt && <p className="text-slate-600">Discharged: {new Date(encounter.dischargedAt).toLocaleString()}</p>}
            {encounter.chiefComplaint && <p className="text-slate-600">Complaint: {encounter.chiefComplaint}</p>}
          </div>
        </div>

        {type === "summary" && (
          <>
            {encounter.triage && (
              <Section title="Triage">
                <p className="text-sm text-slate-700">
                  BP {encounter.triage.bp || "—"} · Temp {encounter.triage.temp ?? "—"}°C · Pulse {encounter.triage.pulse ?? "—"} · SpO2 {encounter.triage.spo2 ?? "—"}% · Priority {encounter.triage.priority}
                </p>
                {encounter.triage.notes && <p className="text-sm text-slate-600 mt-1">{encounter.triage.notes}</p>}
              </Section>
            )}

            {(encounter.consultations || []).length > 0 && (
              <Section title="Consultations">
                {encounter.consultations.map((c: any) => (
                  <div key={c.id} className="mb-2 text-sm">
                    <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</p>
                    {c.diagnosis && <p className="text-slate-700"><span className="font-medium">Diagnosis:</span> {c.diagnosis}</p>}
                    {c.notes && <p className="text-slate-600">{c.notes}</p>}
                  </div>
                ))}
              </Section>
            )}

            {(encounter.radiologyOrders || []).length > 0 && (
              <Section title="Radiology">
                {encounter.radiologyOrders.map((o: any) => (
                  <p key={o.id} className="text-sm text-slate-700 mb-1"><span className="font-medium">{o.examName}:</span> {o.status === "COMPLETED" ? `${o.findings || ""}${o.impression ? ` — Impression: ${o.impression}` : ""}` : "Pending"}</p>
                ))}
              </Section>
            )}

            {(encounter.labOrders || []).length > 0 && (
              <Section title="Laboratory">
                {encounter.labOrders.map((o: any) => (
                  <p key={o.id} className="text-sm text-slate-700 mb-1"><span className="font-medium">{o.testName}:</span> {o.result || "Pending"}</p>
                ))}
              </Section>
            )}

            {(encounter.prescriptions || []).length > 0 && (
              <Section title="Prescriptions">
                {encounter.prescriptions.map((rx: any) => (
                  <p key={rx.id} className="text-sm text-slate-700 mb-1">{rx.item.name} × {rx.quantity} {rx.dispensed ? "(dispensed)" : "(pending)"}</p>
                ))}
              </Section>
            )}

            {(encounter.admissions || []).length > 0 && (
              <Section title="Ward stays">
                {encounter.admissions.map((a: any) => (
                  <p key={a.id} className="text-sm text-slate-700 mb-1">
                    {a.bed.ward.name} — Bed {a.bed.bedNumber} · {new Date(a.admittedAt).toLocaleDateString()}
                    {a.dischargedAt ? ` to ${new Date(a.dischargedAt).toLocaleDateString()}` : " (ongoing)"}
                    {a.admittingDiagnosis ? ` — ${a.admittingDiagnosis}` : ""}
                  </p>
                ))}
              </Section>
            )}

            {(encounter.bookings || []).length > 0 && (
              <Section title="Theatre / equipment">
                {encounter.bookings.map((b: any) => (
                  <p key={b.id} className="text-sm text-slate-700 mb-1">{b.equipment.name} — {b.date?.slice(0,10)} {b.time} — {b.purpose || "No purpose noted"} ({b.status})</p>
                ))}
              </Section>
            )}

            {(encounter.notes || []).length > 0 && (
              <Section title="Additional notes">
                {encounter.notes.map((n: any) => (
                  <p key={n.id} className="text-sm text-slate-700 mb-1"><span className="font-medium">{n.department}:</span> {n.note}</p>
                ))}
              </Section>
            )}
          </>
        )}

        {type === "discharge" && (
          <>
            <Section title="Admitting diagnosis">
              <p className="text-sm text-slate-700">{encounter.admissions?.[0]?.admittingDiagnosis || latestConsultation?.diagnosis || "Not recorded"}</p>
            </Section>
            {(encounter.admissions || []).length > 0 && (
              <Section title="Ward stay">
                {encounter.admissions.map((a: any) => (
                  <p key={a.id} className="text-sm text-slate-700 mb-1">
                    {a.bed.ward.name} — Bed {a.bed.bedNumber} · Admitted {new Date(a.admittedAt).toLocaleString()}
                    {a.dischargedAt ? ` · Discharged ${new Date(a.dischargedAt).toLocaleString()}` : ""}
                  </p>
                ))}
              </Section>
            )}
            <Section title="Treatment summary">
              {(encounter.consultations || []).map((c: any) => (
                <p key={c.id} className="text-sm text-slate-700 mb-1">{c.diagnosis ? `${c.diagnosis} — ` : ""}{c.notes || ""}</p>
              ))}
              {(encounter.prescriptions || []).length > 0 && (
                <p className="text-sm text-slate-700 mt-1">Medicines: {encounter.prescriptions.map((rx: any) => `${rx.item.name} x${rx.quantity}`).join(", ")}</p>
              )}
            </Section>
            <Section title="Discharge instructions / notes">
              {(encounter.notes || []).length === 0 ? (
                <p className="text-sm text-slate-400">No additional instructions recorded.</p>
              ) : (
                encounter.notes.map((n: any) => <p key={n.id} className="text-sm text-slate-700 mb-1">{n.note}</p>)
              )}
            </Section>
            <Section title="Billing status">
              <p className="text-sm text-slate-700">
                Total: {money(total)} —{" "}
                {encounter.payment
                  ? encounter.payment.method === "CASH"
                    ? "Paid (cash)"
                    : encounter.payment.claimStatus === "PARTIALLY_PAID"
                    ? `Insurance: partially paid (${money(encounter.payment.amountPaid)} of ${money(total)} received, ${money(total - Number(encounter.payment.amountPaid))} remaining)`
                    : `Insurance: ${encounter.payment.claimStatus}`
                  : "Not yet billed"}
              </p>
            </Section>
          </>
        )}

        {type === "radiology" && (
          <>
            <Section title="Referral">
              <p className="text-sm text-slate-700"><span className="font-medium">Referred by:</span> {encounter.referringFacility || "Not recorded"}{encounter.referringClinician ? ` — ${encounter.referringClinician}` : ""}</p>
              {encounter.chiefComplaint && <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Clinical information:</span> {encounter.chiefComplaint}</p>}
            </Section>
            {(encounter.radiologyOrders || []).length === 0 ? (
              <Section title="Examinations"><p className="text-sm text-slate-400">No radiology examinations on this visit.</p></Section>
            ) : (
              (encounter.radiologyOrders || []).map((o: any) => (
                <Section key={o.id} title={o.examName}>
                  {o.status === "COMPLETED" ? (
                    <>
                      <p className="text-xs text-slate-400 mb-1">Reported {o.completedAt ? new Date(o.completedAt).toLocaleString() : ""}</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap"><span className="font-medium">Findings:</span> {o.findings}</p>
                      {o.impression && <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap"><span className="font-medium">Impression:</span> {o.impression}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Examination pending — no report yet.</p>
                  )}
                </Section>
              ))
            )}
          </>
        )}

        {(type === "receipt" || type === "theatre") && (encounter.bookings || []).length > 0 && type === "theatre" && (
          <Section title="Procedure details">
            {encounter.bookings.map((b: any) => (
              <div key={b.id} className="mb-3">
                <p className="text-sm font-medium">{b.equipment.name} — {b.date?.slice(0,10)} {b.time} ({b.durationMin} min)</p>
                <p className="text-sm text-slate-600 mb-1">{b.purpose || "No purpose noted"} · Status: {b.status}</p>
                <table className="w-full text-sm">
                  <tbody>
                    {b.charges.map((c: any) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-1">{c.label}</td>
                        <td className="py-1 text-right">{money(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Section>
        )}

        {(type === "receipt" || type === "summary" || type === "discharge") && (encounter.billingItems || []).length > 0 && (
          <Section title="Billing">
            <table className="w-full text-sm">
              <tbody>
                {encounter.billingItems.map((it: any) => (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-1.5">{it.description}</td>
                    <td className="py-1.5 text-right">{money(it.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-2 font-medium">Total</td>
                  <td className="pt-2 font-semibold text-right">{money(total)}</td>
                </tr>
              </tbody>
            </table>
            {encounter.payment && (
              <div className="mt-2">
                <p className="text-sm text-slate-600">
                  {encounter.payment.method === "CASH"
                    ? `Paid in cash${encounter.payment.paidAt ? ` on ${new Date(encounter.payment.paidAt).toLocaleString()}` : ""}`
                    : `Insurance (${encounter.payment.insuranceProvider || "—"}) — claim #${encounter.payment.claimNo || "—"} — status: ${encounter.payment.claimStatus}${encounter.payment.paidAt ? ` — paid ${new Date(encounter.payment.paidAt).toLocaleString()}` : ""}`}
                </p>
                {encounter.payment.method === "INSURANCE" && (encounter.payment.installments || []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-500 mb-1">Payments received</p>
                    <table className="w-full text-xs">
                      <tbody>
                        {encounter.payment.installments.map((inst: any) => (
                          <tr key={inst.id} className="border-b border-slate-100">
                            <td className="py-1 text-slate-500">{new Date(inst.recordedAt).toLocaleString()}</td>
                            <td className="py-1 text-right">{money(inst.amount)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className="pt-1 font-medium">Total received</td>
                          <td className="pt-1 font-semibold text-right">{money(encounter.payment.amountPaid)}</td>
                        </tr>
                        {Number(encounter.payment.amountPaid) < total && (
                          <tr>
                            <td className="text-amber-700 font-medium">Remaining balance</td>
                            <td className="text-amber-700 font-semibold text-right">{money(total - Number(encounter.payment.amountPaid))}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        <div className="mt-10 pt-4 border-t border-slate-200 text-xs text-slate-400">
          This document was generated by Digital Health Solutions and reflects records as of the generation time above.
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-dhs-800 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">{title}</p>
      {children}
    </div>
  );
}
