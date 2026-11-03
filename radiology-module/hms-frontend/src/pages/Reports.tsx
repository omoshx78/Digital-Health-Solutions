import { useState, useEffect, FormEvent, useCallback } from "react";
import { Link } from "react-router-dom";
import { Plus, Receipt, TrendingDown, TrendingUp, Trash2, Printer, ChevronDown, ChevronUp } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, ErrorBanner, money } from "../components/ui";

const EXPENSE_CATEGORIES = ["Drug & supply procurement", "Salaries & wages", "Utilities", "Equipment maintenance", "Transport", "Other"];

type CardKey = "total" | "cash" | "insurance" | "pending" | "expenses" | "net";

export default function Reports() {
  const [period, setPeriod] = useState<"today" | "month" | "all">("today");
  const [summary, setSummary] = useState<any>(null);
  const [collections, setCollections] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [radiology, setRadiology] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], amount: "", vendor: "" });
  const [expanded, setExpanded] = useState<CardKey | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c, cl, e, rad] = await Promise.all([
        api.get(`/reports/summary?period=${period}`),
        api.get(`/reports/collections?period=${period}`),
        api.get(`/reports/claims`),
        api.get(`/reports/expenses?period=${period}`),
        api.get(`/reports/radiology?period=${period}`).catch(() => null),
      ]);
      setSummary(s);
      setCollections(c);
      setClaims(cl.claims);
      setExpenses(e.expenses);
      setRadiology(rad);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load reports");
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const updateClaim = async (encounterId: string, status: string) => {
    try {
      await api.patch(`/encounters/${encounterId}/claim-status`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update claim");
    }
  };

  const submitExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.amount) return;
    try {
      await api.post("/reports/expenses", {
        date: new Date(form.date).toISOString(),
        category: form.category,
        amount: Number(form.amount),
        vendor: form.vendor || undefined,
      });
      setForm({ date: new Date().toISOString().slice(0, 10), category: EXPENSE_CATEGORIES[0], amount: "", vendor: "" });
      setShowExpenseForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save expense");
    }
  };

  const deleteExpense = async (id: string) => {
    await api.delete(`/reports/expenses/${id}`);
    await load();
  };

  const statusColor: Record<string, string> = {
    SUBMITTED: "bg-amber-100 text-amber-800 border-amber-300",
    APPROVED: "bg-sky-100 text-sky-800 border-sky-300",
    PARTIALLY_PAID: "bg-violet-100 text-violet-800 border-violet-300",
    PAID: "bg-emerald-100 text-emerald-800 border-emerald-300",
    REJECTED: "bg-rose-100 text-rose-800 border-rose-300",
  };

  const [claimPaymentTarget, setClaimPaymentTarget] = useState<any | null>(null);
  const [claimPaymentAmount, setClaimPaymentAmount] = useState("");
  const [recordingClaimPayment, setRecordingClaimPayment] = useState(false);

  const [providers, setProviders] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providerReport, setProviderReport] = useState<any>(null);
  const [providerLoading, setProviderLoading] = useState(false);

  useEffect(() => {
    api.get("/reports/insurance-providers").then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderReport(null);
      return;
    }
    setProviderLoading(true);
    api.get(`/reports/insurance-by-provider?provider=${encodeURIComponent(selectedProvider)}&period=${period}`)
      .then(setProviderReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load provider report"))
      .finally(() => setProviderLoading(false));
  }, [selectedProvider, period]);

  const recordClaimPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!claimPaymentTarget || !claimPaymentAmount) return;
    setRecordingClaimPayment(true);
    try {
      await api.post(`/encounters/${claimPaymentTarget.encounterId}/claim-payments`, { amount: Number(claimPaymentAmount) });
      setClaimPaymentTarget(null);
      setClaimPaymentAmount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record payment");
    } finally {
      setRecordingClaimPayment(false);
    }
  };

  const pendingClaims = claims.filter((c) => c.claimStatus === "SUBMITTED" || c.claimStatus === "APPROVED" || c.claimStatus === "PARTIALLY_PAID");
  const combinedTransactions = collections
    ? [...collections.cashTransactions, ...collections.insuranceTransactions].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    : [];

  const toggle = (key: CardKey) => setExpanded((e) => (e === key ? null : key));

  const CARD_DEFS: { key: CardKey; label: string; value: string; extraClass?: string; icon?: any }[] = summary
    ? [
        { key: "total", label: "Total collected", value: money(summary.totalCollected) },
        { key: "cash", label: "Cash", value: money(summary.cash) },
        { key: "insurance", label: "Insurance paid", value: money(summary.insurancePaid) },
        { key: "pending", label: "Pending claims", value: money(summary.pendingClaims), extraClass: "text-amber-700" },
        { key: "expenses", label: "Expenses", value: money(summary.totalExpenses), icon: TrendingDown },
        { key: "net", label: "Net", value: money(summary.net), extraClass: summary.net < 0 ? "text-rose-600" : "text-emerald-700", icon: TrendingUp },
      ]
    : [];

  return (
    <div>
      <SectionHeader
        title="Reports"
        subtitle="Collections, revenue breakdown, insurance claims and expenses — click a figure below to see what makes it up"
        action={
          <div className="flex gap-1.5">
            {(["today", "month", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-full border ${period === p ? "bg-dhs-800 text-white border-dhs-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
              >
                {p === "today" ? "Today" : p === "month" ? "This month" : "All time"}
              </button>
            ))}
          </div>
        }
      />
      <ErrorBanner message={error} />

      {summary && (
        <div className="grid grid-cols-6 gap-3 mb-3">
          {CARD_DEFS.map((c) => {
            const Icon = c.icon;
            const isOpen = expanded === c.key;
            return (
              <button key={c.key} onClick={() => toggle(c.key)} className="text-left">
                <Card className={`!p-4 transition ${isOpen ? "ring-2 ring-dhs-600" : "hover:border-dhs-400"}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-500 flex items-center gap-1">{Icon && <Icon size={12} />} {c.label}</p>
                    {isOpen ? <ChevronUp size={13} className="text-dhs-700" /> : <ChevronDown size={13} className="text-slate-300" />}
                  </div>
                  <p className={`text-xl font-semibold mt-1 ${c.extraClass || ""}`}>{c.value}</p>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      {expanded && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm">{CARD_DEFS.find((c) => c.key === expanded)?.label} — detail</p>
            {expanded !== "net" && (
              <Link to={`/print/report?type=${expanded === "pending" ? "pending-claims" : expanded}&period=${period}`} target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1">
                <Printer size={12} /> Print this list
              </Link>
            )}
          </div>

          {expanded === "net" && summary && (
            <div className="text-sm text-slate-700 space-y-1">
              <p>Cash: <span className="font-medium">{money(summary.cash)}</span></p>
              <p>+ Insurance paid: <span className="font-medium">{money(summary.insurancePaid)}</span></p>
              <p>− Expenses: <span className="font-medium">{money(summary.totalExpenses)}</span></p>
              <p className="pt-1 border-t border-slate-200 mt-1">= Net: <span className={`font-semibold ${summary.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(summary.net)}</span></p>
            </div>
          )}

          {(expanded === "total" || expanded === "cash" || expanded === "insurance") && (
            (() => {
              const rows = expanded === "total" ? combinedTransactions : expanded === "cash" ? collections?.cashTransactions || [] : collections?.insuranceTransactions || [];
              return rows.length === 0 ? (
                <p className="text-sm text-slate-400">No transactions in this period.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Date</th><th className="font-normal text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5">{r.patientName} <span className="text-slate-400 text-xs">({r.mrn})</span></td>
                        <td className="text-slate-500">{r.paidAt ? new Date(r.paidAt).toLocaleString() : "—"}</td>
                        <td className="text-right font-medium">{money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          )}

          {expanded === "pending" && (
            pendingClaims.length === 0 ? (
              <p className="text-sm text-slate-400">No pending claims.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Provider</th><th className="font-normal">Status</th><th className="font-normal text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingClaims.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5">{c.patientName} <span className="text-slate-400 text-xs">({c.mrn})</span></td>
                      <td className="text-slate-500">{c.insuranceProvider || "—"}</td>
                      <td><span className={`text-xs border rounded-full px-2 py-0.5 ${statusColor[c.claimStatus]}`}>{c.claimStatus}</span></td>
                      <td className="text-right font-medium">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {expanded === "expenses" && (
            expenses.length === 0 ? (
              <p className="text-sm text-slate-400">No expenses recorded in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-1.5 font-normal">Date</th><th className="font-normal">Category</th><th className="font-normal">Vendor</th><th className="font-normal text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="text-slate-500">{e.category}</td>
                      <td className="text-slate-500">{e.vendor || "—"}</td>
                      <td className="text-right font-medium">{money(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </Card>
      )}

      {collections && (
        <Card className="mb-4">
          <p className="font-medium text-sm mb-3">Revenue by department</p>
          {Object.keys(collections.byCategory).length === 0 ? (
            <p className="text-sm text-slate-400">No collections in this period.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(collections.byCategory as Record<string, number>).map(([cat, amt]) => (
                <li key={cat} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0">{cat}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="bg-dhs-700 h-2 rounded-full" style={{ width: `${collections.totalCollected ? (amt / collections.totalCollected) * 100 : 0}%` }} />
                  </div>
                  <span className="w-20 text-right text-slate-600">{money(amt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {radiology && (
        <Card className="mb-4">
          <p className="font-medium text-sm mb-1">Radiology (referred patients)</p>
          <p className="text-xs text-slate-500 mb-3">"Billed" is what was charged when the radiologist completed the exam. Money actually collected appears under Revenue by department → Radiology.</p>
          <div className="grid grid-cols-6 gap-3 mb-4">
            {[
              ["Exams performed", String(radiology.examsPerformed)],
              ["Patients served", String(radiology.patientsServed)],
              ["Billed", money(radiology.billed)],
              ["Avg. turnaround", radiology.avgTurnaroundMinutes === null ? "—" : `${radiology.avgTurnaroundMinutes} min`],
              ["Exams waiting", String(radiology.pendingExams)],
              ["Awaiting payment", String(radiology.awaitingClearance)],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-base font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          {radiology.examsPerformed === 0 ? (
            <p className="text-sm text-slate-400">No radiology exams completed in this period.</p>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">By examination</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1 font-normal">Exam</th><th className="font-normal text-right">Count</th><th className="font-normal text-right">Billed</th></tr></thead>
                  <tbody>
                    {radiology.byExam.map((x: any) => (
                      <tr key={x.name} className="border-b border-slate-100 last:border-0"><td className="py-1.5">{x.name}</td><td className="text-right">{x.count}</td><td className="text-right">{money(x.billed)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">By referring facility</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="py-1 font-normal">Facility</th><th className="font-normal text-right">Patients</th><th className="font-normal text-right">Exams</th><th className="font-normal text-right">Billed</th></tr></thead>
                  <tbody>
                    {radiology.byFacility.map((x: any) => (
                      <tr key={x.name} className="border-b border-slate-100 last:border-0"><td className="py-1.5">{x.name}</td><td className="text-right">{x.patients}</td><td className="text-right">{x.exams}</td><td className="text-right">{money(x.billed)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-sm flex items-center gap-1.5"><Receipt size={15} /> Insurance claims <span className="text-slate-400 font-normal">(all claims, not limited to selected period)</span></p>
          <Link to="/print/report?type=pending-claims" target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1"><Printer size={12} /> Print</Link>
        </div>
        {claims.length === 0 ? (
          <p className="text-sm text-slate-400">No insurance claims submitted yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Provider</th><th className="font-normal">Claim #</th><th className="font-normal">Amount</th><th className="font-normal">Paid</th><th className="font-normal">Remaining</th><th className="font-normal">Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2">{c.patientName} <span className="text-slate-400 text-xs">({c.mrn})</span></td>
                  <td className="text-slate-500">{c.insuranceProvider || "—"}</td>
                  <td className="text-slate-500">{c.claimNo || "—"}</td>
                  <td className="font-medium">{money(c.amount)}</td>
                  <td className="text-emerald-700">{money(c.amountPaid)}</td>
                  <td className={c.remaining > 0 ? "text-amber-700 font-medium" : "text-slate-400"}>{money(c.remaining)}</td>
                  <td>
                    <select value={c.claimStatus} onChange={(e) => updateClaim(c.encounterId, e.target.value)} className={`text-xs border rounded-full px-2 py-1 ${statusColor[c.claimStatus] || ""}`}>
                      <option value="SUBMITTED">Submitted</option>
                      <option value="APPROVED">Approved</option>
                      <option value="PARTIALLY_PAID">Partially paid</option>
                      <option value="PAID">Paid</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                  </td>
                  <td>
                    {c.remaining > 0 && c.claimStatus !== "REJECTED" && (
                      <button onClick={() => { setClaimPaymentTarget(c); setClaimPaymentAmount(""); }} className="text-xs text-dhs-700 hover:underline">Record payment</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {claimPaymentTarget && (
          <form onSubmit={recordClaimPayment} className="mt-4 bg-slate-50 rounded-lg p-3 flex items-end gap-2">
            <div className="text-sm flex-1">
              <p className="font-medium">Record payment — {claimPaymentTarget.patientName}</p>
              <p className="text-xs text-slate-500">Remaining balance: {money(claimPaymentTarget.remaining)}</p>
            </div>
            <label className="text-xs">Amount received
              <input required type="number" step="0.01" max={claimPaymentTarget.remaining} value={claimPaymentAmount} onChange={(e) => setClaimPaymentAmount(e.target.value)} className="mt-1 w-32 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm block" />
            </label>
            <button disabled={recordingClaimPayment} className="bg-dhs-800 text-white rounded-lg py-1.5 px-3 text-sm font-medium hover:bg-dhs-900 disabled:opacity-50">
              {recordingClaimPayment ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setClaimPaymentTarget(null)} className="text-sm text-slate-400 hover:text-rose-600 px-1">Cancel</button>
          </form>
        )}
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-sm flex items-center gap-1.5"><Receipt size={15} /> Insurance by provider</p>
          <div className="flex items-center gap-2">
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)} className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5">
              <option value="">Select a provider...</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {selectedProvider && (
              <Link to={`/print/report?type=insurance-provider&provider=${encodeURIComponent(selectedProvider)}&period=${period}`} target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1">
                <Printer size={12} /> Print
              </Link>
            )}
          </div>
        </div>
        {!selectedProvider ? (
          <p className="text-sm text-slate-400">Choose a provider to see how much they've paid in the selected period and what's still pending.</p>
        ) : providerLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : providerReport ? (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Paid in period</p>
                <p className="text-lg font-semibold text-emerald-700">{money(providerReport.paidInPeriod)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Pending now</p>
                <p className="text-lg font-semibold text-amber-700">{money(providerReport.pendingNow)}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-500">Total claims</p>
                <p className="text-lg font-semibold">{providerReport.claimCount}</p>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-600 mb-2">All claims for {selectedProvider}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Claim #</th><th className="font-normal">Amount</th><th className="font-normal">Paid</th><th className="font-normal">Remaining</th><th className="font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {providerReport.claims.map((c: any) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5">{c.patientName} <span className="text-slate-400 text-xs">({c.mrn})</span></td>
                    <td className="text-slate-500">{c.claimNo || "—"}</td>
                    <td>{money(c.amount)}</td>
                    <td className="text-emerald-700">{money(c.amountPaid)}</td>
                    <td className={c.remaining > 0 ? "text-amber-700" : "text-slate-400"}>{money(c.remaining)}</td>
                    <td><span className={`text-xs border rounded-full px-2 py-0.5 ${statusColor[c.claimStatus] || ""}`}>{c.claimStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-sm flex items-center gap-1.5"><Receipt size={15} /> Expenses</p>
          <div className="flex items-center gap-3">
            <Link to={`/print/report?type=expenses&period=${period}`} target="_blank" className="text-xs text-dhs-700 hover:underline inline-flex items-center gap-1"><Printer size={12} /> Print</Link>
            <button onClick={() => setShowExpenseForm((s) => !s)} className="text-xs bg-dhs-800 text-white rounded-lg py-1.5 px-3 font-medium hover:bg-dhs-900 inline-flex items-center gap-1"><Plus size={13} /> Add expense</button>
          </div>
        </div>
        {showExpenseForm && (
          <form onSubmit={submitExpense} className="grid grid-cols-5 gap-2.5 items-end mb-4 bg-slate-50 p-3 rounded-lg">
            <label className="text-xs">Date<input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" /></label>
            <label className="text-xs">Category
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm">
                {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-xs">Amount<input required type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" /></label>
            <label className="text-xs">{form.category === "Salaries & wages" ? "Staff name" : "Vendor"}<input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} placeholder={form.category === "Salaries & wages" ? "e.g. Jane Doe" : ""} className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" /></label>
            <button className="bg-dhs-800 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-dhs-900">Save</button>
          </form>
        )}
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-400">No expenses recorded in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 font-normal">Date</th><th className="font-normal">Category</th><th className="font-normal">Vendor / Staff</th><th className="font-normal">Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="text-slate-500">{e.category}</td>
                  <td className="text-slate-500">{e.vendor || "—"}</td>
                  <td className="font-medium">{money(e.amount)}</td>
                  <td className="text-right"><button onClick={() => deleteExpense(e.id)}><Trash2 size={14} className="text-slate-400 hover:text-rose-600" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
