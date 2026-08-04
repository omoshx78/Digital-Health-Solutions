import { useEffect, useState, useCallback, ReactNode } from "react";
import { Users } from "lucide-react";
import { api, ApiError } from "../api/client";
import { QueueEntry } from "../types";
import { Card, Badge, PRIORITY_COLORS, ErrorBanner } from "./ui";

interface QueueBoardProps {
  department: string;
  title: string;
  subtitle: string;
  /** Render the action form/details for the currently-selected claimed patient. */
  renderAction: (entry: QueueEntry, onDone: () => void) => ReactNode;
  /** Poll interval in ms; defaults to 5s so multiple staff stay roughly in sync. */
  pollMs?: number;
}

export function QueueBoard({ department, title, subtitle, renderAction, pollMs = 5000 }: QueueBoardProps) {
  const [waiting, setWaiting] = useState<QueueEntry[]>([]);
  const [mine, setMine] = useState<QueueEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/queue/${department}`);
      setWaiting(res.waiting);
      setMine(res.mine);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }, [department]);

  useEffect(() => {
    load();
    const interval = setInterval(load, pollMs);
    return () => clearInterval(interval);
  }, [load, pollMs]);

  const claim = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/queue/${id}/claim`);
      await load();
      setSelectedId(id);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      await load(); // someone else may have claimed it — refresh
    } finally {
      setBusyId(null);
    }
  };

  const release = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/queue/${id}/release`);
      if (selectedId === id) setSelectedId(null);
      await load();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const selected = mine.find((m) => m.id === selectedId) || null;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-1">
          {mine.length > 0 && (
            <>
              <p className="font-medium text-sm mb-2 text-dhs-800">My patients ({mine.length})</p>
              <ul className="space-y-2 mb-4">
                {mine.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm ${selectedId === e.id ? "border-dhs-600 bg-dhs-50" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <div className="flex justify-between items-center">
                        <p className="font-medium">{e.encounter.patient?.firstName} {e.encounter.patient?.lastName}</p>
                        <Badge className={PRIORITY_COLORS[e.priority]}>{e.priority}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">{e.encounter.patient?.mrn}</p>
                    </button>
                    <button
                      onClick={() => release(e.id)}
                      disabled={busyId === e.id}
                      className="text-xs text-slate-400 hover:text-rose-600 mt-1 ml-1"
                    >
                      Release back to queue
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="font-medium text-sm mb-2">Waiting ({waiting.length})</p>
          {waiting.length === 0 ? (
            <p className="text-sm text-slate-400">Queue is empty.</p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((e) => (
                <li key={e.id} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex justify-between items-center">
                    <p className="font-medium text-sm">{e.encounter.patient?.firstName} {e.encounter.patient?.lastName}</p>
                    <Badge className={PRIORITY_COLORS[e.priority]}>{e.priority}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mb-1.5">{e.encounter.patient?.mrn} · {e.encounter.chiefComplaint || "No complaint noted"}</p>
                  <button
                    onClick={() => claim(e.id)}
                    disabled={busyId === e.id}
                    className="text-xs bg-dhs-800 text-white rounded-lg py-1.5 px-3 font-medium hover:bg-dhs-900 disabled:opacity-50"
                  >
                    {busyId === e.id ? "Claiming..." : "Pick this patient"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-2">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 border border-dashed border-slate-300 rounded-xl">
              <Users size={28} className="mb-2" />
              <p className="text-sm">Pick a patient from the waiting list, or select one of your claimed patients.</p>
            </div>
          ) : (
            renderAction(selected, () => {
              setSelectedId(null);
              load();
            })
          )}
        </Card>
      </div>
    </div>
  );
}
