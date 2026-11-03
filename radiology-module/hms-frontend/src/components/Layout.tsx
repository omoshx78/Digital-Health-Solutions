import { NavLink, Outlet, Link } from "react-router-dom";
import {
  LayoutDashboard, UserPlus, Activity, Stethoscope, FlaskConical, Pill,
  Wallet, CalendarClock, Boxes, BedDouble, BarChart3, LogOut, Users, KeyRound, ShieldCheck, Tag, ShieldAlert, ScanLine, Receipt,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Role } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  roles: Role[] | "all";
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: "all" },
  { to: "/patients", label: "Patients", icon: Users, roles: ["RECEPTIONIST", "DOCTOR", "CASHIER", "ADMIN"] },
  { to: "/reception", label: "Reception", icon: UserPlus, roles: ["RECEPTIONIST", "ADMIN"] },
  { to: "/clearance", label: "Payment clearance", icon: Receipt, roles: ["RECEPTIONIST", "CASHIER", "ADMIN"] },
  { to: "/triage", label: "Triage", icon: Activity, roles: ["NURSE", "ADMIN"] },
  { to: "/consultation", label: "Consultation", icon: Stethoscope, roles: ["DOCTOR", "ADMIN"] },
  { to: "/laboratory", label: "Laboratory", icon: FlaskConical, roles: ["LAB_TECH", "ADMIN"] },
  { to: "/pharmacy", label: "Pharmacy", icon: Pill, roles: ["PHARMACIST", "ADMIN"] },
  { to: "/cashier", label: "Cashier", icon: Wallet, roles: ["CASHIER", "ADMIN"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["CASHIER", "ADMIN"] },
  { to: "/theatre", label: "Theatre & equipment", icon: CalendarClock, roles: ["DOCTOR", "NURSE", "WARD_NURSE", "THEATRE_NURSE", "ADMIN"] },
  { to: "/radiology", label: "Radiology", icon: ScanLine, roles: ["RADIOLOGIST", "ADMIN"] },
  { to: "/wards", label: "Wards", icon: BedDouble, roles: ["DOCTOR", "NURSE", "WARD_NURSE", "ADMIN"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["PHARMACIST", "ADMIN"] },
  { to: "/staff", label: "Staff", icon: ShieldCheck, roles: ["ADMIN"] },
  { to: "/pricing", label: "Pricing", icon: Tag, roles: ["ADMIN"] },
  { to: "/audit-log", label: "Audit log", icon: ShieldAlert, roles: ["ADMIN"] },
  { to: "/print/self-register-qr", label: "Registration QR", icon: UserPlus, roles: ["ADMIN", "RECEPTIONIST"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const visible = NAV.filter((n) => n.roles === "all" || (user && n.roles.includes(user.role)));

  return (
    <div className="w-full min-h-screen bg-slate-50 text-slate-900 flex">
      <aside className="w-56 shrink-0 bg-dhs-900 text-dhs-50 flex flex-col">
        <div className="px-4 py-5 border-b border-dhs-800 bg-white">
          <img src="/logo.png" alt="Digital Health Solutions" className="h-9 w-auto" />
        </div>
        <nav className="flex-1 py-2">
          {visible.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition ${
                    isActive ? "bg-dhs-800 text-white border-r-2 border-emerald-400" : "text-dhs-200 hover:bg-dhs-800/60"
                  }`
                }
              >
                <Icon size={16} /> {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-dhs-800 text-xs">
          <p className="text-dhs-100 font-medium">{user?.name}</p>
          <p className="text-dhs-400 mb-2">{user?.role}</p>
          <Link to="/change-password" className="flex items-center gap-1.5 text-dhs-300 hover:text-white mb-1.5">
            <KeyRound size={13} /> Change password
          </Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-dhs-300 hover:text-white">
            <LogOut size={13} /> Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
