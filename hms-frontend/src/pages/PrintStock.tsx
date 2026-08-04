import { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import { money } from "../components/ui";
import { PrintShell } from "../components/PrintShell";

export default function PrintStock() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setItems(await api.get("/inventory"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load stock list");
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  return (
    <PrintShell title="Stock List" backTo="/inventory" backLabel="Back to Inventory">
      {["Medicine", "Consumable", "Equipment"].map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <p className="text-xs font-semibold text-dhs-800 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">{cat}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 font-normal">Item</th><th className="font-normal">Stock</th><th className="font-normal">Reorder at</th><th className="font-normal">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {catItems.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-1.5">{i.name}</td>
                    <td className={i.quantity <= i.reorderLevel ? "text-rose-600 font-medium" : ""}>{i.quantity} {i.unit}</td>
                    <td className="text-slate-500">{i.reorderLevel}</td>
                    <td className="text-slate-500">{money(i.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="text-xs text-slate-400 mt-4">{items.length} item(s) total. Items in red are at or below reorder level.</p>
    </PrintShell>
  );
}
