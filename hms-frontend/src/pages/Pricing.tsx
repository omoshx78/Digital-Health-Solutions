import { useState, useEffect, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Tag, Printer } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner, money } from "../components/ui";
import { ChargeCatalogItem } from "../types";

const CATEGORIES = ["Consultation", "Laboratory", "Other"] as const;

export default function Pricing() {
  const [items, setItems] = useState<ChargeCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: "Laboratory" as (typeof CATEGORIES)[number], name: "", price: "" });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setItems(await api.get("/charges?includeInactive=true"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load pricing");
    }
  };
  useEffect(() => { load(); }, []);

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) return;
    setError(null);
    try {
      await api.post("/charges", { category: form.category, name: form.name, price: Number(form.price) });
      setForm({ category: "Laboratory", name: "", price: "" });
      setShowAdd(false);
      setSuccess("Charge added.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add charge");
    }
  };

  const savePrice = async (id: string) => {
    const newPrice = edits[id];
    if (!newPrice) return;
    setError(null);
    try {
      await api.patch(`/charges/${id}`, { price: Number(newPrice) });
      setEdits((e) => ({ ...e, [id]: "" }));
      setSuccess("Price updated.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update price");
    }
  };

  const toggleActive = async (item: ChargeCatalogItem) => {
    setError(null);
    try {
      await api.patch(`/charges/${item.id}`, { active: !item.active });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update charge");
    }
  };

  const grouped = CATEGORIES.map((cat) => ({ cat, items: items.filter((i) => i.category === cat) }));

  return (
    <div>
      <SectionHeader
        title="Pricing"
        subtitle="Adjust existing charges or add new lab tests / fees"
        action={
          <div className="flex gap-2">
            <Link to="/print/pricing" target="_blank" className="border border-slate-300 text-slate-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"><Printer size={15} /> Print price list</Link>
            <button onClick={() => setShowAdd((s) => !s)} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5"><Plus size={15} /> Add charge</button>
          </div>
        }
      />
      <ErrorBanner message={error} />
      {success && <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">{success}</div>}

      {showAdd && (
        <Card className="mb-4">
          <form onSubmit={submitAdd} className="grid grid-cols-4 gap-2.5 items-end">
            <label className="text-sm">Category
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as any }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm col-span-2">Name<input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Stool Microscopy" /></label>
            <label className="text-sm">Price (KSh)<input required type="number" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <button className="col-span-4 mt-1 bg-dhs-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-dhs-900">Save charge</button>
          </form>
        </Card>
      )}

      {grouped.map(({ cat, items: catItems }) => (
        <Card key={cat} className="mb-4">
          <p className="font-medium text-sm mb-3 flex items-center gap-1.5"><Tag size={15} /> {cat}</p>
          {catItems.length === 0 ? (
            <p className="text-sm text-slate-400">No {cat.toLowerCase()} charges yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 font-normal">Name</th><th className="font-normal">Current price</th><th className="font-normal">New price</th><th className="font-normal">Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {catItems.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">{i.name}{i.code && <span className="text-xs text-slate-400 ml-1.5">(system)</span>}</td>
                    <td className="text-slate-600">{money(i.price)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <input type="number" step="0.01" placeholder="new price" value={edits[i.id] || ""} onChange={(e) => setEdits((ed) => ({ ...ed, [i.id]: e.target.value }))} className="w-24 border border-slate-300 rounded px-2 py-1 text-xs" />
                        <button onClick={() => savePrice(i.id)} className="text-xs text-dhs-700 hover:underline">Save</button>
                      </div>
                    </td>
                    <td><Badge className={i.active ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-slate-100 text-slate-500 border-slate-300"}>{i.active ? "Active" : "Inactive"}</Badge></td>
                    <td>
                      {!i.code && (
                        <button onClick={() => toggleActive(i)} className="text-xs text-slate-500 hover:underline">{i.active ? "Deactivate" : "Reactivate"}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </div>
  );
}
