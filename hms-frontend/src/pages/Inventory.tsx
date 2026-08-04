import { useState, useEffect, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Printer } from "lucide-react";
import { api, ApiError } from "../api/client";
import { Card, SectionHeader, Badge, ErrorBanner, money } from "../components/ui";
import { InventoryItem } from "../types";

const CATEGORIES = ["All", "Medicine", "Consumable", "Equipment"];

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [restockAmounts, setRestockAmounts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", category: "Medicine", unit: "tablet", quantity: "0", reorderLevel: "20", unitPrice: "0" });

  const load = async () => {
    try {
      setItems(await api.get(filter === "All" ? "/inventory" : `/inventory?category=${filter}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load inventory");
    }
  };
  useEffect(() => { load(); }, [filter]);

  const submitAdd = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/inventory", {
        name: form.name,
        category: form.category,
        unit: form.unit,
        quantity: Number(form.quantity),
        reorderLevel: Number(form.reorderLevel),
        unitPrice: Number(form.unitPrice),
      });
      setForm({ name: "", category: "Medicine", unit: "tablet", quantity: "0", reorderLevel: "20", unitPrice: "0" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add item");
    }
  };

  const restock = async (id: string) => {
    const qty = Number(restockAmounts[id] || 0);
    if (qty <= 0) return;
    try {
      await api.post(`/inventory/${id}/restock`, { quantity: qty });
      setRestockAmounts((r) => ({ ...r, [id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restock");
    }
  };

  return (
    <div>
      <SectionHeader
        title="Inventory & stock"
        subtitle="Medicines, consumables and equipment stock levels"
        action={
          <div className="flex gap-2">
            <Link to="/print/stock" target="_blank" className="border border-slate-300 text-slate-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"><Printer size={15} /> Print stock list</Link>
            <button onClick={() => setShowAdd((s) => !s)} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5"><Plus size={15} /> Add item</button>
          </div>
        }
      />
      <ErrorBanner message={error} />
      {showAdd && (
        <Card className="mb-4">
          <form onSubmit={submitAdd} className="grid grid-cols-6 gap-2.5 items-end">
            <label className="text-sm">Name<input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Category
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option>Medicine</option><option>Consumable</option><option>Equipment</option>
              </select>
            </label>
            <label className="text-sm">Unit<input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Qty<input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Reorder at<input type="number" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <label className="text-sm">Unit price<input type="number" step="0.01" value={form.unitPrice} onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></label>
            <button className="col-span-6 mt-1 bg-dhs-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-dhs-900">Save item</button>
          </form>
        </Card>
      )}
      <div className="flex gap-2 mb-3">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`text-xs px-3 py-1.5 rounded-full border ${filter === c ? "bg-dhs-800 text-white border-dhs-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>{c}</button>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-1.5 font-normal">Item</th><th className="font-normal">Category</th><th className="font-normal">Stock</th><th className="font-normal">Reorder at</th><th className="font-normal">Unit price</th><th className="font-normal">Restock</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2">{i.name}</td>
                <td className="text-slate-500">{i.category}</td>
                <td>
                  <Badge className={i.quantity <= i.reorderLevel ? "bg-rose-100 text-rose-800 border-rose-300" : "bg-emerald-100 text-emerald-800 border-emerald-300"}>
                    {i.quantity} {i.unit}
                  </Badge>
                </td>
                <td className="text-slate-500">{i.reorderLevel}</td>
                <td className="text-slate-500">{money(i.unitPrice)}</td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <input type="number" placeholder="qty" value={restockAmounts[i.id] || ""} onChange={(e) => setRestockAmounts((r) => ({ ...r, [i.id]: e.target.value }))} className="w-16 border border-slate-300 rounded px-2 py-1 text-xs" />
                    <button onClick={() => restock(i.id)} className="text-xs text-dhs-700 hover:underline">Add</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
