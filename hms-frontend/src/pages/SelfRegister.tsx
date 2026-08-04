import { useState, FormEvent } from "react";
import { api, ApiError } from "../api/client";

const emptyForm = {
  firstName: "",
  lastName: "",
  gender: "FEMALE",
  phone: "",
  nationalId: "",
  address: "",
  nextOfKinName: "",
  nextOfKinPhone: "",
  isInsured: false,
  insuranceProvider: "",
  insuranceNo: "",
  chiefComplaint: "",
};

export default function SelfRegister() {
  const [form, setForm] = useState(emptyForm);
  const [consent, setConsent] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ mrn: string; name: string } | null>(null);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setError("Please read and accept the consent form to continue.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/public/self-register", {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        phone: form.phone,
        nationalId: form.nationalId || undefined,
        address: form.address || undefined,
        nextOfKinName: form.nextOfKinName || undefined,
        nextOfKinPhone: form.nextOfKinPhone || undefined,
        insuranceProvider: form.isInsured ? form.insuranceProvider : undefined,
        insuranceNo: form.isInsured ? form.insuranceNo : undefined,
        chiefComplaint: form.chiefComplaint || undefined,
        consent: true,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit registration. Please see the front desk for help.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-xl font-semibold text-dhs-900 mb-2">Thank you, {result.name.split(" ")[0]}</p>
          <p className="text-sm text-slate-600 mb-1">Your registration has been received.</p>
          <p className="text-sm text-slate-600 mb-4">Your record number is <span className="font-medium">{result.mrn}</span>.</p>
          <p className="text-sm text-slate-500">Please take a seat — reception will call you shortly to confirm your details before you're seen.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <img src="/logo.png" alt="Digital Health Solutions" className="h-10 w-auto mb-1" />
        <p className="text-sm text-slate-500 mb-6">Patient self-registration</p>

        {error && <div className="mb-4 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm border border-rose-200">{error}</div>}

        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">First name<input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Last name<input required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Gender
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-sm">Phone number<input required value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          </div>
          <label className="text-sm block">National ID (optional)<input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <label className="text-sm block">Address (optional)<input value={form.address} onChange={(e) => set("address", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Next of kin name (optional)<input value={form.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Next of kin phone (optional)<input value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
          </div>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={form.isInsured} onChange={(e) => set("isInsured", e.target.checked)} />
            I have insurance cover
          </label>
          {form.isInsured && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Insurance provider<input value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
              <label className="text-sm">Policy / member no.<input value={form.insuranceNo} onChange={(e) => set("insuranceNo", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            </div>
          )}
          <label className="text-sm block">Reason for today's visit<input value={form.chiefComplaint} onChange={(e) => set("chiefComplaint", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. fever, follow-up, checkup" /></label>

          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <button type="button" onClick={() => setShowConsent((s) => !s)} className="text-sm text-dhs-700 hover:underline">
              {showConsent ? "Hide" : "Read"} consent for treatment & use of my information
            </button>
            {showConsent && (
              <div className="mt-3 text-xs text-slate-600 space-y-2 max-h-64 overflow-auto pr-1">
                <p className="font-medium">Digital Health Solutions — Patient Consent for Treatment and Use of Medical Information</p>
                <p>By accepting below, I confirm the following:</p>
                <p><span className="font-medium">1. Consent to Treatment.</span> I consent to receive medical examination, investigation (including laboratory tests and imaging where needed), and treatment from the clinical staff of this facility, based on their professional judgment of my condition.</p>
                <p><span className="font-medium">2. Consent to Collection and Use of Personal & Medical Information.</span> I understand this facility will collect my personal and medical information to provide care, maintain my medical record, process billing/insurance claims, and comply with applicable health reporting laws.</p>
                <p><span className="font-medium">3. Confidentiality.</span> My information will be kept confidential and shared only with my treating clinicians, my insurance provider for claims, where required by law, or with my explicit consent.</p>
                <p><span className="font-medium">4. Insurance Billing.</span> If I use insurance cover, I authorize this facility to submit claims on my behalf and share the necessary information for that claim.</p>
                <p><span className="font-medium">5. My Rights.</span> I may ask questions about my care, request a copy of my records, and withdraw consent for future data collection, understanding this may affect the facility's ability to treat me.</p>
                <p><span className="font-medium">6. Voluntary Agreement.</span> I confirm I am providing this consent voluntarily and it has been explained to me in a language I understand.</p>
              </div>
            )}
            <label className="text-sm flex items-start gap-2 mt-3">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
              <span>I have read (or had read to me) and understood the consent form, and I agree to treatment and to the collection and use of my information as described.</span>
            </label>
          </div>

          <button disabled={submitting} className="w-full bg-dhs-800 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
