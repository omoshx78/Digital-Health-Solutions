export type Role = "ADMIN" | "RECEPTIONIST" | "NURSE" | "DOCTOR" | "LAB_TECH" | "PHARMACIST" | "CASHIER" | "WARD_NURSE" | "THEATRE_NURSE" | "RADIOLOGIST";

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface ChargeCatalogItem {
  id: string;
  code?: string | null;
  category: "Consultation" | "Laboratory" | "Radiology" | "Other";
  name: string;
  price: string;
  active: boolean;
}

export interface Patient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  gender: string;
  phone?: string;
  nationalId?: string;
  insuranceProvider?: string;
  insuranceNo?: string;
  encounters?: Encounter[];
}

export interface TriageRecord {
  bp?: string;
  temp?: number;
  pulse?: number;
  spo2?: number;
  weight?: number;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  notes?: string;
}

export interface LabOrder {
  id: string;
  testName: string;
  price: string;
  status: "PENDING" | "COMPLETED";
  result?: string;
}

export interface RadiologyOrder {
  id: string;
  examName: string;
  price: string;
  status: "PENDING" | "COMPLETED";
  findings?: string;
  impression?: string;
  completedAt?: string;
}

export interface Prescription {
  id: string;
  itemId: string;
  quantity: number;
  dispensed: boolean;
  item: { id: string; name: string; unit: string; quantity: number; unitPrice: string };
}

export interface BillingItem {
  id: string;
  description: string;
  amount: string;
  category?: string;
}

export interface ConsultationRecord {
  id: string;
  doctorId?: string;
  diagnosis?: string;
  notes?: string;
  createdAt: string;
}

export interface EncounterNote {
  id: string;
  department: string;
  authorId?: string;
  note: string;
  createdAt: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  status: string;
  type?: string;
  chiefComplaint?: string;
  referringFacility?: string;
  referringClinician?: string;
  radiologyOrders?: RadiologyOrder[];
  patient?: Patient;
  triage?: TriageRecord;
  consultations?: ConsultationRecord[];
  labOrders?: LabOrder[];
  prescriptions?: Prescription[];
  billingItems?: BillingItem[];
  payment?: any;
  notes?: EncounterNote[];
}

export interface QueueEntry {
  id: string;
  encounterId: string;
  department: string;
  status: "WAITING" | "CLAIMED" | "COMPLETED" | "CANCELLED";
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  createdAt: string;
  claimedAt?: string;
  encounter: Encounter;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  unitPrice: string;
}
