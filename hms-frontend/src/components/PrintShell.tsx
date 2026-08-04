import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  backTo: string;
  backLabel: string;
  children: ReactNode;
}

export function PrintShell({ title, subtitle, backTo, backLabel, children }: Props) {
  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <Link to={backTo} className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
          <ArrowLeft size={15} /> {backLabel}
        </Link>
        <button onClick={() => window.print()} className="bg-dhs-800 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-dhs-900 inline-flex items-center gap-1.5">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>
      <div className="print-page max-w-4xl mx-auto bg-white shadow-sm my-6 p-10">
        <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
          <div>
            <img src="/logo.png" alt="Digital Health Solutions" className="h-8 w-auto mb-1" />
            <p className="text-sm text-slate-500">{title}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <p className="text-xs text-slate-500">Generated: {new Date().toLocaleString()}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
