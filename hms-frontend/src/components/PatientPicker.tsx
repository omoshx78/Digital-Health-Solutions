import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { api } from "../api/client";
import { Patient } from "../types";

interface Props {
  onSelect: (patient: Patient) => void;
  placeholder?: string;
}

/**
 * Search-as-you-type patient finder. Fires a debounced search on every
 * keystroke (name, MRN, phone, or national ID all match) and shows a
 * dropdown to pick from — no need to type a full name or hit Enter.
 */
export function PatientPicker({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await api.get(`/patients?search=${encodeURIComponent(query.trim())}`);
        setResults(res);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = (p: Patient) => {
    onSelect(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder || "Search by name, MRN, phone, or ID number..."}
          className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm"
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {loading && <p className="text-xs text-slate-400 px-3 py-2">Searching...</p>}
          {!loading && results.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">No matches.</p>}
          {!loading && results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
            >
              <p className="font-medium">{p.firstName} {p.lastName}</p>
              <p className="text-xs text-slate-500">{p.mrn} · {p.phone || "no phone"}{p.nationalId ? ` · ID ${p.nationalId}` : ""}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
