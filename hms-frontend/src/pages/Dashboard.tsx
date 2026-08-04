import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, ArrowRight } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Card, SectionHeader, Badge, money } from "../components/ui";

const DEPARTMENTS = [
  { key: "TRIAGE", label: "Triage", to: "/triage" },
  { key: "CONSULTATION", label: "Consultation", to: "/consultation" },
  { key: "LABORATORY", label: "Laboratory", to: "/laboratory" },
  { key: "PHARMACY", label: "Pharmacy", to: "/pharmacy" },
  { key: "CASHIER", label: "Cashier", to: "/cashier" },
  { key: "WARD", label: "Ward referrals", to: "/wards" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const results = await Promise.allSettled([
        ...DEPARTMENTS.map((d) => api.get(`/queue/${d.key}`)),
        api.get("/inventory?lowStock=true"),
        api.get(`/theatre/bookings?date=${new Date().toISOString().slice(0, 10)}`),
        user?.role === "CASHIER" || user?.role === "ADMIN" ? api.get("/reports/summary?period=today") : Promise.resolve(null),
      ]);

      const nextCounts: Record<string, number> = {};
      DEPARTMENTS.forEach((d, i) => {
        const r = results[i];
        nextCounts[d.key] = r.status === "fulfilled" ? r.value.waiting.length : 0;
      });
      setCounts(nextCounts);

      const lowStockResult = results[DEPARTMENTS.length];
      setLowStock(lowStockResult.status === "fulfilled" ? lowStockResult.value : []);

      const bookingsResult = results[DEPARTMENTS.length + 1];
      setBookings(bookingsResult.status === "fulfilled" ? bookingsResult.value : []);

      const summaryResult = results[DEPARTMENTS.length + 2];
      setSummary(summaryResult.status === "fulfilled" ? summaryResult.value : null);

      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="text-sm text-slate-400">Loading dashboard...</div>;

  return (
    <div>
      <SectionHeader title="Dashboard" subtitle="Live overview of patient flow, stock, and bookings" />

      <div className="grid grid-cols-6 gap-3 mb-6">
        {DEPARTMENTS.map((d) => (
          <Link key={d.key} to={d.to}>
            <Card className="!p-4 hover:border-dhs-400 transition">
              <p className="text-xs text-slate-500">{d.label} queue</p>
              <p className="text-2xl font-semibold mt-1">{counts[d.key] ?? 0}</p>
            </Card>
          </Link>
        ))}
      </div>

      {summary && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Card className="!p-4">
            <p className="text-xs text-slate-500">Collected today</p>
            <p className="text-xl font-semibold mt-1">{money(summary.totalCollected)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-slate-500">Pending claims</p>
            <p className="text-xl font-semibold mt-1 text-amber-700">{money(summary.pendingClaims)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-slate-500">Expenses today</p>
            <p className="text-xl font-semibold mt-1">{money(summary.totalExpenses)}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-xs text-slate-500">Net</p>
            <p className={`text-xl font-semibold mt-1 ${summary.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(summary.net)}</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><AlertTriangle size={15} className="text-amber-600" /> Low stock alerts</p>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400">All stock levels healthy.</p>
          ) : (
            <ul className="space-y-2">
              {lowStock.slice(0, 8).map((i) => (
                <li key={i.id} className="flex justify-between text-sm">
                  <span>{i.name}</span>
                  <Badge className="bg-rose-100 text-rose-800 border-rose-300">{i.quantity} {i.unit} left</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><CalendarClock size={15} className="text-dhs-700" /> Today's theatre & equipment bookings</p>
          {bookings.length === 0 ? (
            <p className="text-sm text-slate-400">No bookings today.</p>
          ) : (
            <ul className="space-y-2">
              {bookings.slice(0, 8).map((b) => (
                <li key={b.id} className="flex justify-between text-sm">
                  <span>{b.equipment.name} — {b.encounter?.patient ? `${b.encounter.patient.firstName} ${b.encounter.patient.lastName}` : "Unassigned"}</span>
                  <span className="text-slate-500">{b.time} <Badge className="ml-1 bg-slate-100 text-slate-600 border-slate-300">{b.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Link to="/patients" className="text-sm text-dhs-700 hover:underline inline-flex items-center gap-1">
          Search all patients <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
