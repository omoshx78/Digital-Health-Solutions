import { Routes, Route, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { Role } from "./types";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Reception from "./pages/Reception";
import Triage from "./pages/Triage";
import Consultation from "./pages/Consultation";
import Laboratory from "./pages/Laboratory";
import Pharmacy from "./pages/Pharmacy";
import Cashier from "./pages/Cashier";
import Reports from "./pages/Reports";
import Theatre from "./pages/Theatre";
import Wards from "./pages/Wards";
import Inventory from "./pages/Inventory";
import Staff from "./pages/Staff";
import ChangePassword from "./pages/ChangePassword";
import PrintView from "./pages/PrintView";
import PrintStaffRoster from "./pages/PrintStaffRoster";
import PrintStock from "./pages/PrintStock";
import PrintPatients from "./pages/PrintPatients";
import PrintPricing from "./pages/PrintPricing";
import PrintAdmitted from "./pages/PrintAdmitted";
import PrintReportDetail from "./pages/PrintReportDetail";
import Pricing from "./pages/Pricing";
import AuditLog from "./pages/AuditLog";
import SelfRegister from "./pages/SelfRegister";
import PrintSelfRegisterQR from "./pages/PrintSelfRegisterQR";

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && user.role !== "ADMIN" && !roles.includes(user.role)) {
    return (
      <div className="p-8 text-slate-500 text-sm">
        Your role ({user.role}) doesn't have access to this page. Ask an admin if you need it.
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <div className="p-8 text-sm text-slate-400">Loading...</div> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route path="/self-register" element={<SelfRegister />} />
      <Route
        path="/print/self-register-qr"
        element={
          <Guard roles={["ADMIN", "RECEPTIONIST"]}>
            <PrintSelfRegisterQR />
          </Guard>
        }
      />
      <Route
        path="/print/:encounterId"
        element={
          <Guard>
            <PrintView />
          </Guard>
        }
      />
      <Route
        path="/print/staff"
        element={
          <Guard roles={["ADMIN"]}>
            <PrintStaffRoster />
          </Guard>
        }
      />
      <Route
        path="/print/stock"
        element={
          <Guard roles={["PHARMACIST"]}>
            <PrintStock />
          </Guard>
        }
      />
      <Route
        path="/print/patients"
        element={
          <Guard>
            <PrintPatients />
          </Guard>
        }
      />
      <Route
        path="/print/pricing"
        element={
          <Guard roles={["ADMIN"]}>
            <PrintPricing />
          </Guard>
        }
      />
      <Route
        path="/print/admitted"
        element={
          <Guard roles={["DOCTOR", "NURSE", "WARD_NURSE"]}>
            <PrintAdmitted />
          </Guard>
        }
      />
      <Route
        path="/print/report"
        element={
          <Guard roles={["CASHIER"]}>
            <PrintReportDetail />
          </Guard>
        }
      />
      <Route
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/patients"
          element={
            <Guard roles={["RECEPTIONIST", "DOCTOR", "CASHIER"]}>
              <Patients />
            </Guard>
          }
        />
        <Route
          path="/reception"
          element={
            <Guard roles={["RECEPTIONIST"]}>
              <Reception />
            </Guard>
          }
        />
        <Route
          path="/triage"
          element={
            <Guard roles={["NURSE"]}>
              <Triage />
            </Guard>
          }
        />
        <Route
          path="/consultation"
          element={
            <Guard roles={["DOCTOR"]}>
              <Consultation />
            </Guard>
          }
        />
        <Route
          path="/laboratory"
          element={
            <Guard roles={["LAB_TECH"]}>
              <Laboratory />
            </Guard>
          }
        />
        <Route
          path="/pharmacy"
          element={
            <Guard roles={["PHARMACIST"]}>
              <Pharmacy />
            </Guard>
          }
        />
        <Route
          path="/cashier"
          element={
            <Guard roles={["CASHIER"]}>
              <Cashier />
            </Guard>
          }
        />
        <Route
          path="/reports"
          element={
            <Guard roles={["CASHIER"]}>
              <Reports />
            </Guard>
          }
        />
        <Route
          path="/theatre"
          element={
            <Guard roles={["DOCTOR", "NURSE", "WARD_NURSE", "THEATRE_NURSE"]}>
              <Theatre />
            </Guard>
          }
        />
        <Route
          path="/wards"
          element={
            <Guard roles={["DOCTOR", "NURSE", "WARD_NURSE"]}>
              <Wards />
            </Guard>
          }
        />
        <Route
          path="/inventory"
          element={
            <Guard roles={["PHARMACIST"]}>
              <Inventory />
            </Guard>
          }
        />
        <Route
          path="/staff"
          element={
            <Guard roles={["ADMIN"]}>
              <Staff />
            </Guard>
          }
        />
        <Route
          path="/pricing"
          element={
            <Guard roles={["ADMIN"]}>
              <Pricing />
            </Guard>
          }
        />
        <Route
          path="/audit-log"
          element={
            <Guard roles={["ADMIN"]}>
              <AuditLog />
            </Guard>
          }
        />
        <Route path="/change-password" element={<ChangePassword />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
