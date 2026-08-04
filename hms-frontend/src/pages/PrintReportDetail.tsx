import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { money } from "../components/ui";
import { PrintShell } from "../components/PrintShell";

const TITLES: Record<string, string> = {
  cash: "Cash Collections",
  insurance: "Insurance Collections (Paid)",
  "pending-claims": "Pending Insurance Claims",
  expenses: "Expenses",
  "insurance-provider": "Insurance Provider Report",
};

export default function PrintReportDetail() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get("type") || "cash";
  const period = searchParams.get("period") || "today";
  const provider = searchParams.get("provider") || "";
  const [rows, setRows] = useState<any[]>([]);
  const [providerData, setProviderData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (type === "cash" || type === "insurance") {
          const data = await api.get(`/reports/collections?period=${period}`);
          setRows(type === "cash" ? data.cashTransactions : data.insuranceTransactions);
        } else if (type === "pending-claims") {
          const data = await api.get("/reports/claims");
          setRows(data.claims.filter((c: any) => c.claimStatus === "SUBMITTED" || c.claimStatus === "APPROVED" || c.claimStatus === "PARTIALLY_PAID"));
        } else if (type === "expenses") {
          const data = await api.get(`/reports/expenses?period=${period}`);
          setRows(data.expenses);
        } else if (type === "insurance-provider") {
          const data = await api.get(`/reports/insurance-by-provider?provider=${encodeURIComponent(provider)}&period=${period}`);
          setProviderData(data);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load report detail");
      }
    })();
  }, [type, period, provider]);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <PrintShell
      title={type === "insurance-provider" ? `Insurance Report — ${provider}` : TITLES[type] || "Report"}
      subtitle={`Period: ${period === "today" ? "Today" : period === "month" ? "This month" : "All time"}`}
      backTo="/reports"
      backLabel="Back to Reports"
    >
      {(type === "cash" || type === "insurance") && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Date</th>
              {type === "insurance" && <th className="font-normal">Provider / Claim #</th>}
              <th className="font-normal text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5">{r.patientName} ({r.mrn})</td>
                <td className="text-slate-500">{r.paidAt ? new Date(r.paidAt).toLocaleString() : "—"}</td>
                {type === "insurance" && <td className="text-slate-500">{r.insuranceProvider || "—"} {r.claimNo ? `#${r.claimNo}` : ""}</td>}
                <td className="text-right">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {type === "pending-claims" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Provider</th><th className="font-normal">Claim #</th><th className="font-normal">Status</th><th className="font-normal">Total</th><th className="font-normal">Paid</th><th className="font-normal text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5">{r.patientName} ({r.mrn})</td>
                <td className="text-slate-500">{r.insuranceProvider || "—"}</td>
                <td className="text-slate-500">{r.claimNo || "—"}</td>
                <td className="text-slate-500">{r.claimStatus}</td>
                <td className="text-slate-500">{money(r.amount)}</td>
                <td className="text-slate-500">{money(r.amountPaid)}</td>
                <td className="text-right">{money(r.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {type === "expenses" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-normal">Date</th><th className="font-normal">Category</th><th className="font-normal">Vendor / Staff</th><th className="font-normal text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="py-1.5">{new Date(r.date).toLocaleDateString()}</td>
                <td className="text-slate-500">{r.category}</td>
                <td className="text-slate-500">{r.vendor || "—"}</td>
                <td className="text-right">{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {type === "insurance-provider" && providerData && (
        <div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Paid in period</p>
              <p className="text-lg font-semibold">{money(providerData.paidInPeriod)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Pending now</p>
              <p className="text-lg font-semibold">{money(providerData.pendingNow)}</p>
            </div>
            <div className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">Total claims</p>
              <p className="text-lg font-semibold">{providerData.claimCount}</p>
            </div>
          </div>

          <p className="text-xs font-semibold text-dhs-800 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">Payments received in period</p>
          {providerData.payments.length === 0 ? (
            <p className="text-sm text-slate-400 mb-4">No payments received from this provider in this period.</p>
          ) : (
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Date</th><th className="font-normal text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {providerData.payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5">{p.patientName} ({p.mrn})</td>
                    <td className="text-slate-500">{new Date(p.recordedAt).toLocaleString()}</td>
                    <td className="text-right">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="text-xs font-semibold text-dhs-800 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">All claims for this provider</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-1.5 font-normal">Patient</th><th className="font-normal">Claim #</th><th className="font-normal">Status</th><th className="font-normal">Total</th><th className="font-normal">Paid</th><th className="font-normal text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {providerData.claims.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="py-1.5">{c.patientName} ({c.mrn})</td>
                  <td className="text-slate-500">{c.claimNo || "—"}</td>
                  <td className="text-slate-500">{c.claimStatus}</td>
                  <td className="text-slate-500">{money(c.amount)}</td>
                  <td className="text-slate-500">{money(c.amountPaid)}</td>
                  <td className="text-right">{money(c.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {type !== "insurance-provider" && (
        rows.length === 0 ? (
          <p className="text-sm text-slate-400 mt-3">No records found for this period.</p>
        ) : (
          <div className="flex justify-between mt-3 pt-2 border-t border-slate-300 font-semibold text-sm">
            <span>Total</span><span>{money(total)}</span>
          </div>
        )
      )}
    </PrintShell>
  );
}
