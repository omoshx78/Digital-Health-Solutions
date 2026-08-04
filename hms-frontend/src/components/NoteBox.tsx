import { useState } from "react";
import { StickyNote } from "lucide-react";
import { api } from "../api/client";
import { EncounterNote } from "../types";

interface Props {
  encounterId: string;
  existingNotes?: EncounterNote[];
}

/** Small note box: shows prior notes on this visit and lets staff add one. */
export function NoteBox({ encounterId, existingNotes }: Props) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localNotes, setLocalNotes] = useState<EncounterNote[]>(existingNotes || []);

  const submit = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      const created = await api.post(`/encounters/${encounterId}/notes`, { note: note.trim() });
      setLocalNotes((n) => [...n, created]);
      setNote("");
    } catch {
      // non-critical — note-taking shouldn't block the main workflow
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3">
      {localNotes.length > 0 && (
        <ul className="space-y-1 mb-2">
          {localNotes.map((n) => (
            <li key={n.id} className="text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="font-medium text-slate-600">{n.department}:</span> {n.note}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
          placeholder="Add a note for the doctor / patient record..."
          className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
        />
        <button type="button" onClick={submit} disabled={submitting} className="text-xs bg-slate-800 text-white rounded-lg px-3 hover:bg-slate-900 disabled:opacity-50 inline-flex items-center gap-1">
          <StickyNote size={12} /> Add
        </button>
      </div>
    </div>
  );
}
