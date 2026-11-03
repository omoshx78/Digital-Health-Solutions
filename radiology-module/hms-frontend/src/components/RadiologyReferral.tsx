import { useState, useEffect, FormEvent } from "react";
import { ScanLine, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, ErrorBanner, money } from "./ui";
import { ChargeCatalogItem, Patient } from "../types";
import { PatientPicker } from "./PatientPicker";

const emptyNewPatient = {
  firstName: "",
  lastName: "",
  gender: "FEMALE",
  phone: "",
  nationalId: "",
  isInsured: false,
  insuranceProvider: "",
  insuranceNo: "",
};

const emptyReferral = {
  referringFacility: "",
  referringClinician: "",
  clinicalInfo: "",
  priority: "NORMAL",
};

/**
 * Reception form for patients referred from another clinic for imaging.
 * Skips triage and consultation: submitting sends the patient straight to
 * the Radiology queue.
 */
export function RadiologyReferral() {
  const [exams, setExams] = useState<ChargeCatalogItem[] | null>(null);
  const [mode, setMode] = useState<"new" | "returning">("new");
  const [patient, setPatient] = useState(emptyNewPatient);
  const [returning, setReturning] = useState<Patient | null>(null);
  const [referral, setReferral] = useState(emptyReferral);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/charges?category=Radiology").then(setExams).catch(() => setExams([]));
  }, []);

  const setP = (k: string, v: any) => setPatient((f) => ({ ...f, [k]: v }));
  const setR = (k: string, v: string) => setReferral((f) => ({ ...f, [k]: v }));
  const toggleExam = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const total = (exams || []).filter((e) => selected.includes(e.id)).reduce((s, e) => s + Number(e.price), 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (mode === "returning" && !returning) {
      setError("Search for and select the returning patient first.");
      return;
    }
    if (selected.length === 0) {
      setError("Select at least one examination.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/radiology/referrals", {
        ...(mode === "returning"
          ? { patientId: returning!.id }
          : {
              newPatient: {
                firstName: patient.firstName,
                lastName: patient.lastName,
                gender: patient.gender,
                phone: patient.phone || undefined,
                nationalId: patient.nationalId || undefined,
                insuranceProvider: patient.isInsured ? patient.insuranceProvider || undefined : undefined,
                insuranceNo: patient.isInsured ? patient.insuranceNo || undefined : undefined,
              },
            }),
        referringFacility: referral.referringFacility,
        referringClinician: referral.referringClinician || undefined,
        clinicalInfo: referral.clinicalInfo || undefined,
        priority: referral.priority,
        examIds: selected,
      });
      setSuccess(`${res.patient.firstName} ${res.patient.lastName} (${res.patient.mrn}) sent to Radiology.`);
      setPatient(emptyNewPatient);
      setReturning(null);
      setReferral(emptyReferral);
      setSelected([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register the referral");
    } finally {
      setSubmitting(false);
    }
  };

  const input = "mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm";

  return (
    <Card className="mt-5">
      <p className="font-medium text-sm mb-1 flex items-center gap-1.5"><ScanLine size={15} /> Radiology referral</p>
      <p className="text-xs text-slate-500 mb-3">For patients sent from another clinic for imaging. They go straight to Radiology, then return here for payment clearance.</p>
      <ErrorBanner message={error} />
      {success && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs border border-emerald-200 flex items-start gap-1.5">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {success}
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-2 gap-x-5 gap-y-3">
        <div className="col-span-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New patient</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={mode === "returning"} onChange={() => setMode("returning")} /> Returning patient (already has an MRN)</label>
        </div>

        {mode === "new" ? (
          <>
            <label className="text-sm">First name<input required value={patient.firstName} onChange={(e) => setP("firstName", e.target.value)} className={input} /></label>
            <label className="text-sm">Last name<input required value={patient.lastName} onChange={(e) => setP("lastName", e.target.value)} className={input} /></label>
            <label className="text-sm">Gender
              <select value={patient.gender} onChange={(e) => setP("gender", e.target.value)} className={input}>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-sm">Phone<input value={patient.phone} onChange={(e) => setP("phone", e.target.value)} className={input} /></label>
            <label className="text-sm">National ID (optional)<input value={patient.nationalId} onChange={(e) => setP("nationalId", e.target.value)} className={input} /></label>
            <label className="text-sm flex items-center gap-2 self-end pb-2">
              <input type="checkbox" checked={patient.isInsured} onChange={(e) => setP("isInsured", e.target.checked)} /> Patient has insurance cover
            </label>
            {patient.isInsured && (
              <>
                <label className="text-sm">Insurance provider<input value={patient.insuranceProvider} onChange={(e) => setP("insuranceProvider", e.target.value)} className={input} /></label>
                <label className="text-sm">Policy / member no.<input value={patient.insuranceNo} onChange={(e) => setP("insuranceNo", e.target.value)} className={input} /></label>
              </>
            )}
          </>
        ) : (
          <div className="col-span-2">
            {!returning ? (
              <PatientPicker onSelect={setReturning} />
            ) : (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-sm">
                  <p className="font-medium">{returning.firstName} {returning.lastName}</p>
                  <p className="text-xs text-slate-500">{returning.mrn} · {returning.phone || "no phone"}</p>
                </div>
                <button type="button" onClick={() => setReturning(null)} className="text-xs text-slate-400 hover:text-rose-600">Change</button>
              </div>
            )}
          </div>
        )}

        <div className="col-span-2 border-t border-slate-100 pt-3 grid grid-cols-2 gap-x-5 gap-y-3">
          <label className="text-sm">Referring clinic / facility
            <input required value={referral.referringFacility} onChange={(e) => setR("referringFacility", e.target.value)} className={input} placeholder="e.g. Kibera Community Clinic" />
          </label>
          <label className="text-sm">Referring clinician (optional)
            <input value={referral.referringClinician} onChange={(e) => setR("referringClinician", e.target.value)} className={input} placeholder="Name of the doctor who referred" />
          </label>
          <label className="text-sm col-span-2">Clinical information / reason for exam
            <textarea rows={2} value={referral.clinicalInfo} onChange={(e) => setR("clinicalInfo", e.target.value)} className={input} placeholder="From the referral letter" />
          </label>
          <label className="text-sm">Priority
            <select value={referral.priority} onChange={(e) => setR("priority", e.target.value)} className={input}>
              <option value="NORMAL">Normal</option>
              <option value="URGENT">Urgent</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </label>
        </div>

        <div className="col-span-2">
          <p className="text-sm mb-1.5">Examinations requested</p>
          {exams === null ? (
            <p className="text-xs text-slate-400">Loading price list...</p>
          ) : exams.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No radiology exams are set up yet. An admin needs to add them under Pricing → Radiology.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {exams.map((x) => (
                <label key={x.id} className={`text-sm border rounded-lg px-3 py-2 flex items-start gap-2 cursor-pointer ${selected.includes(x.id) ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input type="checkbox" className="mt-0.5" checked={selected.includes(x.id)} onChange={() => toggleExam(x.id)} />
                  <span>{x.name}<span className="block text-xs text-slate-500">{money(x.price)}</span></span>
                </label>
              ))}
            </div>
          )}
          {selected.length > 0 && <p className="text-xs text-slate-500 mt-2">Estimated charge: <span className="font-medium text-slate-700">{money(total)}</span></p>}
        </div>

        <button disabled={submitting || !exams || exams.length === 0} className="col-span-2 bg-dhs-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
          {submitting ? "Sending..." : "Register referral & send to Radiology"}
        </button>
      </form>
    </Card>
  );
}
