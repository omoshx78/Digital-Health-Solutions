import { useState, useEffect } from "react";
import { api, ApiError } from "../api/client";
import { money } from "../components/ui";
import { PrintShell } from "../components/PrintShell";

export default function PrintPricing() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setItems(await api.get("/charges"));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load price list");
      }
    })();
  }, []);

  if (error) return <div className="p-8 text-sm text-rose-600">{error}</div>;

  return (
    <PrintShell title="Price List" subtitle="Active charges" backTo="/pricing" backLabel="Back to Pricing">
      {["Consultation", "Laboratory", "Other"].map((cat) => {
        const catItems = items.filter((i) => i.category === cat);
        if (catItems.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <p className="text-xs font-semibold text-dhs-800 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">{cat}</p>
            <table className="w-full text-sm">
              <tbody>
                {catItems.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-1.5">{i.name}</td>
                    <td className="py-1.5 text-right">{money(i.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </PrintShell>
  );
}
