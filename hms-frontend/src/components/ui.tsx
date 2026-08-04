import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>{children}</div>;
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>{children}</span>;
}

export const PRIORITY_COLORS: Record<string, string> = {
  EMERGENCY: "bg-rose-100 text-rose-800 border-rose-300",
  URGENT: "bg-amber-100 text-amber-800 border-amber-300",
  NORMAL: "bg-slate-100 text-slate-700 border-slate-300",
};

export function money(n: number | string) {
  const num = typeof n === "string" ? Number(n) : n;
  return "KSh " + Math.round(num).toLocaleString();
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mb-4 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm border border-rose-200">{message}</div>;
}
