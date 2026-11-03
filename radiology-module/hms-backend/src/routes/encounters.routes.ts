import { Router } from "express";
import { z } from "zod";
import { Department } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue, nextAfterConsultation, nextAfterLab } from "../utils/workflow";
import { logAction } from "../utils/audit";

const router = Router();

/**
 * Confirms the caller currently holds the CLAIMED queue entry for this
 * encounter/department before letting them act on it. This is what stops
 * a doctor from submitting a consultation for a patient someone else has
 * claimed (or nobody has claimed yet).
 */
async function requireClaimedEntry(encounterId: string, department: Department, userId: string) {
  const entry = await prisma.queueEntry.findFirst({
    where: { encounterId, department, status: "CLAIMED", claimedById: userId },
  });
  return entry;
}

/**
 * GET /encounters/:id
 * Full detail for a single visit — everything needed to render any
 * printable document (medical report, discharge summary, receipt,
 * theatre record) in one call.
 */
router.get("/:id", requireAuth, async (req, res) => {
  const encounter = await prisma.encounter.findUnique({
    where: { id: req.params.id },
    include: {
      patient: true,
      triage: true,
      consultations: { orderBy: { createdAt: "asc" } },
      labOrders: true,
      radiologyOrders: true,
      prescriptions: { include: { item: true } },
      billingItems: true,
      payment: { include: { installments: { orderBy: { recordedAt: "asc" } } } },
      notes: { orderBy: { createdAt: "asc" } },
      admissions: { include: { bed: { include: { ward: true } } }, orderBy: { admittedAt: "asc" } },
      bookings: { include: { equipment: true, charges: true } },
    },
  });
  if (!encounter) return res.status(404).json({ error: "Visit not found" });
  res.json(encounter);
});

/**
 * POST /:id/confirm-registration
 * Reception has reviewed a self-registration (submitted via the QR code
 * form) and confirms it's accurate — this is what actually puts the
 * patient into the Triage queue. Before this, self-registered patients
 * sit in a holding state nobody clinical can see.
 */
router.post("/:id/confirm-registration", requireAuth, requireRole("RECEPTIONIST"), async (req: AuthedRequest, res) => {
  const encounter = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (!encounter.selfRegistered) return res.status(400).json({ error: "This visit wasn't a self-registration" });
  if (encounter.status !== "REGISTERED") return res.status(400).json({ error: "This registration was already confirmed" });

  await prisma.$transaction(async (tx) => {
    await tx.encounter.update({ where: { id: encounter.id }, data: { status: "TRIAGE" } });
    await enqueue(tx, encounter.id, "TRIAGE");
  });

  await logAction({ userId: req.user!.id, action: "registration.confirmed", entityType: "Encounter", entityId: encounter.id });
  res.json({ ok: true });
});

// Maps a staff member's role to a human-readable department label, used to
// tag notes so a doctor reading the patient's record can see at a glance
// who left each note.
const ROLE_DEPARTMENT_LABEL: Record<string, string> = {
  NURSE: "Triage",
  DOCTOR: "Consultation",
  LAB_TECH: "Laboratory",
  PHARMACIST: "Pharmacy",
  CASHIER: "Cashier",
  WARD_NURSE: "Ward",
  THEATRE_NURSE: "Theatre",
  RADIOLOGIST: "Radiology",
  RECEPTIONIST: "Reception",
  ADMIN: "Admin",
};

const noteSchema = z.object({ note: z.string().min(1) });

/**
 * POST /encounters/:id/notes
 * A note any staff member can leave on a patient's visit — tagged with
 * their department automatically. These show up on the patient's
 * permanent profile (visible to any doctor) and, for triage/consultation
 * notes specifically, are also surfaced directly in the consultation
 * screens for continuity of care.
 */
router.post("/:id/notes", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Note text is required" });

  const encounter = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  const note = await prisma.encounterNote.create({
    data: {
      encounterId: req.params.id,
      department: ROLE_DEPARTMENT_LABEL[req.user!.role] || req.user!.role,
      authorId: req.user!.id,
      note: parsed.data.note,
    },
  });
  res.status(201).json(note);
});

// ---------------- Triage ----------------

const triageSchema = z.object({
  bp: z.string().optional(),
  temp: z.number().optional(),
  pulse: z.number().int().optional(),
  spo2: z.number().int().optional(),
  weight: z.number().optional(),
  priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).default("NORMAL"),
  notes: z.string().optional(),
});

router.post("/:id/triage", requireAuth, requireRole("NURSE"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = triageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const entry = await requireClaimedEntry(encounterId, "TRIAGE", req.user!.id);
  if (!entry) {
    return res.status(403).json({ error: "You must claim this patient from the triage queue before recording vitals" });
  }

  const result = await prisma.$transaction(async (tx) => {
    const triage = await tx.triageRecord.create({
      data: { encounterId, ...parsed.data, recordedById: req.user!.id },
    });
    await tx.encounter.update({ where: { id: encounterId }, data: { status: "CONSULTATION" } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    // Urgent/emergency triage priority carries forward so doctors see the sickest patients first.
    await enqueue(tx, encounterId, "CONSULTATION", parsed.data.priority);
    return triage;
  });

  await logAction({ userId: req.user!.id, action: "triage.recorded", entityType: "Encounter", entityId: encounterId });
  res.status(201).json(result);
});

// ---------------- Consultation ----------------

const consultationSchema = z.object({
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  labTestIds: z.array(z.string()).default([]), // ChargeCatalogItem ids (category Laboratory)
  prescriptions: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).default([]),
  // Optional direct routing — used when the doctor doesn't need lab/pharmacy
  // first and wants to send the patient straight to theatre or discharge
  // them on this first visit. When set, labTestIds/prescriptions are ignored.
  decision: z.enum(["THEATRE", "DISCHARGE"]).optional(),
});

router.post("/:id/consultation", requireAuth, requireRole("DOCTOR"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = consultationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { diagnosis, notes, decision } = parsed.data;
  const labTestIds = decision ? [] : parsed.data.labTestIds;
  const prescriptions = decision ? [] : parsed.data.prescriptions;

  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  const entry = await requireClaimedEntry(encounterId, "CONSULTATION", req.user!.id);
  if (!entry) {
    return res.status(403).json({ error: "You must claim this patient from the consultation queue first" });
  }

  // Emergency visits are billed at the emergency consultation rate, not
  // the routine one — both are admin-editable in Pricing.
  const feeCode = encounter.type === "EMERGENCY" ? "CONSULTATION_EMERGENCY" : "CONSULTATION_ROUTINE";
  const feeItem = await prisma.chargeCatalogItem.findUnique({ where: { code: feeCode } });
  if (!feeItem) return res.status(500).json({ error: `Missing system charge "${feeCode}" — an admin needs to re-seed pricing` });

  let labItems: { id: string; name: string; price: any }[] = [];
  if (labTestIds.length > 0) {
    labItems = await prisma.chargeCatalogItem.findMany({ where: { id: { in: labTestIds }, category: "Laboratory", active: true } });
    if (labItems.length !== labTestIds.length) {
      return res.status(400).json({ error: "One or more selected lab tests are no longer available" });
    }
  }
  if (prescriptions.length > 0) {
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: prescriptions.map((p) => p.itemId) } } });
    if (items.length !== prescriptions.length) {
      return res.status(400).json({ error: "One or more prescribed items don't exist in inventory" });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.consultation.create({ data: { encounterId, doctorId: req.user!.id, diagnosis, notes } });
    await tx.billingItem.create({
      data: { encounterId, description: feeItem.name, amount: feeItem.price, category: "Consultation" },
    });
    for (const t of labItems) {
      await tx.labOrder.create({
        data: { encounterId, testName: t.name, price: t.price, orderedById: req.user!.id },
      });
    }
    for (const rx of prescriptions) {
      await tx.prescription.create({ data: { encounterId, itemId: rx.itemId, quantity: rx.quantity } });
    }

    const nextDept: Department = decision === "THEATRE" ? "THEATRE" : decision === "DISCHARGE" ? "CASHIER" : nextAfterConsultation(labItems.length > 0, prescriptions.length > 0);
    const nextStatus = decision === "THEATRE" ? "AWAITING_THEATRE" : (nextDept as any);
    await tx.encounter.update({ where: { id: encounterId }, data: { status: nextStatus } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, nextDept);
    return { nextDepartment: nextDept };
  });

  await logAction({ userId: req.user!.id, action: "consultation.recorded", entityType: "Encounter", entityId: encounterId, details: { decision } });
  res.status(201).json(result);
});

// ---------------- Laboratory ----------------

const labResultsSchema = z.object({
  results: z.array(z.object({ labOrderId: z.string(), result: z.string().min(1) })).min(1),
});

router.post("/:id/lab-results", requireAuth, requireRole("LAB_TECH"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = labResultsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const entry = await requireClaimedEntry(encounterId, "LABORATORY", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the laboratory queue first" });

  const orders = await prisma.labOrder.findMany({ where: { encounterId, status: "PENDING" } });
  const triage = await prisma.triageRecord.findUnique({ where: { encounterId } });

  await prisma.$transaction(async (tx) => {
    for (const r of parsed.data.results) {
      const order = orders.find((o) => o.id === r.labOrderId);
      if (!order) continue;
      await tx.labOrder.update({
        where: { id: order.id },
        data: { status: "COMPLETED", result: r.result, resultedById: req.user!.id, resultedAt: new Date() },
      });
      await tx.billingItem.create({
        data: { encounterId, description: `Lab: ${order.testName}`, amount: order.price, category: "Laboratory" },
      });
    }

    // Always back to the doctor — results need a clinician's eyes before
    // anything else happens (pharmacy, ward, or discharge).
    const nextDept = nextAfterLab();
    await tx.encounter.update({ where: { id: encounterId }, data: { status: nextDept as any } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, nextDept, triage?.priority);
  });

  await logAction({ userId: req.user!.id, action: "lab.results_entered", entityType: "Encounter", entityId: encounterId });
  res.json({ ok: true });
});

// ---------------- Consultation review (after lab results) ----------------

const reviewSchema = z.object({
  decision: z.enum(["PHARMACY", "WARD", "THEATRE", "DISCHARGE"]),
  notes: z.string().optional(),
  prescriptions: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).default([]),
});

/**
 * A doctor reviewing lab/equipment results has four outcomes: send to
 * pharmacy for medication, refer to a ward for admission, refer to
 * theatre for a procedure, or dismiss the patient (no further treatment)
 * straight to the cashier — in every case, whatever was already charged
 * (consultation + lab fees) still stands.
 */
router.post("/:id/consultation-review", requireAuth, requireRole("DOCTOR"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { decision, notes, prescriptions } = parsed.data;

  const entry = await requireClaimedEntry(encounterId, "CONSULTATION", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the consultation queue first" });

  if (decision === "PHARMACY") {
    if (prescriptions.length === 0) {
      return res.status(400).json({ error: "Add at least one medicine to send this patient to pharmacy" });
    }
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: prescriptions.map((p) => p.itemId) } } });
    if (items.length !== prescriptions.length) {
      return res.status(400).json({ error: "One or more prescribed items don't exist in inventory" });
    }
  }

  const nextDept: Department =
    decision === "PHARMACY" ? "PHARMACY" : decision === "WARD" ? "WARD" : decision === "THEATRE" ? "THEATRE" : "CASHIER";
  const nextStatus =
    decision === "WARD" ? "AWAITING_ADMISSION" : decision === "THEATRE" ? "AWAITING_THEATRE" : (nextDept as any);

  await prisma.$transaction(async (tx) => {
    await tx.consultation.create({
      data: {
        encounterId,
        doctorId: req.user!.id,
        notes: `Lab review — decision: ${decision}.${notes ? " " + notes : ""}`,
      },
    });
    if (decision === "PHARMACY") {
      for (const rx of prescriptions) {
        await tx.prescription.create({ data: { encounterId, itemId: rx.itemId, quantity: rx.quantity } });
      }
    }
    await tx.encounter.update({ where: { id: encounterId }, data: { status: nextStatus } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await enqueue(tx, encounterId, nextDept);
  });

  await logAction({
    userId: req.user!.id,
    action: "consultation.review_decided",
    entityType: "Encounter",
    entityId: encounterId,
    details: { decision },
  });
  res.json({ ok: true, decision });
});

// ---------------- Pharmacy ----------------

router.post("/:id/dispense", requireAuth, requireRole("PHARMACIST"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;

  const entry = await requireClaimedEntry(encounterId, "PHARMACY", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the pharmacy queue first" });

  const prescriptions = await prisma.prescription.findMany({
    where: { encounterId, dispensed: false },
    include: { item: true },
  });

  for (const rx of prescriptions) {
    if (rx.item.quantity < rx.quantity) {
      return res.status(409).json({ error: `Insufficient stock for ${rx.item.name} (have ${rx.item.quantity}, need ${rx.quantity})` });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const rx of prescriptions) {
      await tx.inventoryItem.update({ where: { id: rx.itemId }, data: { quantity: { decrement: rx.quantity } } });
      await tx.inventoryTransaction.create({
        data: {
          itemId: rx.itemId,
          changeQty: -rx.quantity,
          reason: "Dispensed",
          referenceType: "Prescription",
          referenceId: rx.id,
          createdById: req.user!.id,
        },
      });
      await tx.prescription.update({
        where: { id: rx.id },
        data: { dispensed: true, dispensedAt: new Date(), dispensedById: req.user!.id },
      });
      await tx.billingItem.create({
        data: {
          encounterId,
          description: `Pharmacy: ${rx.item.name} x${rx.quantity}`,
          amount: Number(rx.item.unitPrice) * rx.quantity,
          category: "Pharmacy",
        },
      });
    }
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });

    // An admitted inpatient stays in the ward after their medication is
    // dispensed — they don't get routed to the cashier mid-stay. Ward
    // charges (including this medication) get billed together at
    // discharge, same as the bed's daily rate.
    const openAdmission = await tx.admission.findFirst({ where: { encounterId, dischargedAt: null } });
    if (!openAdmission) {
      await tx.encounter.update({ where: { id: encounterId }, data: { status: "CASHIER" } });
      await enqueue(tx, encounterId, "CASHIER");
    }
  });

  await logAction({ userId: req.user!.id, action: "pharmacy.dispensed", entityType: "Encounter", entityId: encounterId });
  res.json({ ok: true, itemsDispensed: prescriptions.length });
});

// ---------------- Cashier ----------------

const addChargeSchema = z.object({
  description: z.string().min(1),
  amount: z.number().min(0.01),
});

/**
 * POST /encounters/:id/billing-items
 * Lets the cashier currently handling this patient add a miscellaneous
 * charge to the bill before payment (e.g. a supply fee not captured
 * elsewhere). Requires the same claim as recording payment, so it can't
 * be used to tamper with a bill from outside the normal flow.
 */
router.post("/:id/billing-items", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const parsed = addChargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const entry = await requireClaimedEntry(req.params.id, "CASHIER", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the cashier queue first" });

  const item = await prisma.billingItem.create({
    data: { encounterId: req.params.id, description: parsed.data.description, amount: parsed.data.amount, category: "Other" },
  });

  await logAction({ userId: req.user!.id, action: "billing.charge_added", entityType: "BillingItem", entityId: item.id, details: parsed.data });
  res.status(201).json(item);
});

const paymentSchema = z.object({
  method: z.enum(["CASH", "INSURANCE"]),
  insuranceProvider: z.string().optional(),
  claimNo: z.string().optional(),
});

router.post("/:id/payment", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.id;
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { method, insuranceProvider, claimNo } = parsed.data;

  const entry = await requireClaimedEntry(encounterId, "CASHIER", req.user!.id);
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the cashier queue first" });

  const existingPayment = await prisma.payment.findUnique({ where: { encounterId } });
  if (existingPayment) {
    return res.status(409).json({ error: "This visit was already paid — it should no longer be in the queue. Refresh the page." });
  }

  const billingItems = await prisma.billingItem.findMany({ where: { encounterId } });
  const total = billingItems.reduce((s, i) => s + Number(i.amount), 0);
  const isInsurance = method === "INSURANCE";

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        encounterId,
        method,
        amount: total,
        amountPaid: isInsurance ? 0 : total,
        insuranceProvider: isInsurance ? insuranceProvider : undefined,
        claimNo: isInsurance ? claimNo : undefined,
        claimStatus: isInsurance ? "SUBMITTED" : undefined,
        claimSubmittedAt: isInsurance ? new Date() : undefined,
        paidAt: isInsurance ? undefined : new Date(),
        recordedById: req.user!.id,
      },
    });
    await tx.encounter.update({
      where: { id: encounterId },
      data: { status: "DISCHARGED", dischargedAt: new Date() },
    });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return p;
  });

  await logAction({
    userId: req.user!.id,
    action: isInsurance ? "payment.claim_submitted" : "payment.cash_received",
    entityType: "Encounter",
    entityId: encounterId,
    details: { amount: total },
  });

  res.status(201).json(payment);
});

// ---------------- Insurance claim status updates ----------------

const claimStatusSchema = z.object({ status: z.enum(["SUBMITTED", "APPROVED", "PARTIALLY_PAID", "PAID", "REJECTED"]) });

router.patch("/:id/claim-status", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const parsed = claimStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });

  const payment = await prisma.payment.findUnique({ where: { encounterId: req.params.id } });
  if (!payment) return res.status(404).json({ error: "No payment/claim found for this encounter" });

  const updated = await prisma.payment.update({
    where: { encounterId: req.params.id },
    data: {
      claimStatus: parsed.data.status,
      paidAt: parsed.data.status === "PAID" ? new Date() : null,
    },
  });

  await logAction({
    userId: req.user!.id,
    action: "claim.status_updated",
    entityType: "Payment",
    entityId: payment.id,
    details: { status: parsed.data.status },
  });

  res.json(updated);
});

// ---------------- Partial / installment insurance payments ----------------

const claimPaymentSchema = z.object({
  amount: z.number().min(0.01),
  notes: z.string().optional(),
});

/**
 * POST /:id/claim-payments
 * Records money actually received from an insurer against a claim —
 * possibly one of several installments. Automatically moves the claim to
 * PARTIALLY_PAID once any (but not all) of the balance is received, or
 * PAID once the full amount has come in. Works regardless of whether the
 * patient's encounter is still active or long since discharged.
 */
router.post("/:id/claim-payments", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const parsed = claimPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const payment = await prisma.payment.findUnique({ where: { encounterId: req.params.id } });
  if (!payment) return res.status(404).json({ error: "No insurance claim found for this visit" });
  if (payment.method !== "INSURANCE") return res.status(400).json({ error: "This visit wasn't billed to insurance" });
  if (payment.claimStatus === "REJECTED") return res.status(400).json({ error: "This claim is marked rejected — change its status before recording a payment" });
  if (payment.claimStatus === "PAID") return res.status(400).json({ error: "This claim is already fully paid" });

  const remaining = Number(payment.amount) - Number(payment.amountPaid);
  if (parsed.data.amount > remaining + 0.01) {
    return res.status(400).json({ error: `That's more than the remaining balance of ${remaining.toFixed(2)}` });
  }

  const newAmountPaid = Number(payment.amountPaid) + parsed.data.amount;
  const fullyPaid = newAmountPaid >= Number(payment.amount) - 0.01;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.claimPayment.create({
      data: {
        paymentId: payment.id,
        amount: parsed.data.amount,
        recordedById: req.user!.id,
        notes: parsed.data.notes,
      },
    });
    return tx.payment.update({
      where: { id: payment.id },
      data: {
        amountPaid: newAmountPaid,
        claimStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID",
        paidAt: fullyPaid ? new Date() : payment.paidAt,
      },
      include: { installments: { orderBy: { recordedAt: "asc" } } },
    });
  });

  await logAction({
    userId: req.user!.id,
    action: "claim.payment_recorded",
    entityType: "Payment",
    entityId: payment.id,
    details: { amount: parsed.data.amount, fullyPaid },
  });

  res.status(201).json(updated);
});

// ---------------- Admin recovery ----------------

/**
 * POST /encounters/:id/cancel
 * Admin-only escape hatch for a visit that's gotten stuck (e.g. a bed
 * mix-up, a workflow change mid-visit, or any other edge case that leaves
 * a patient with no valid next step). This doesn't delete anything —
 * healthcare records shouldn't just vanish — it closes out the visit
 * cleanly: cancels any active queue entries, frees any bed still tied to
 * an open admission, cancels any pending theatre bookings, and marks the
 * encounter CANCELLED. The patient can then be registered for a fresh
 * visit if they still need care.
 */
router.post("/:id/cancel", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const encounter = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });
  if (encounter.status === "DISCHARGED" || encounter.status === "CANCELLED") {
    return res.status(400).json({ error: `This visit is already ${encounter.status.toLowerCase()}` });
  }

  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.updateMany({
      where: { encounterId: encounter.id, status: { in: ["WAITING", "CLAIMED"] } },
      data: { status: "CANCELLED" },
    });
    const openAdmissions = await tx.admission.findMany({ where: { encounterId: encounter.id, dischargedAt: null } });
    for (const a of openAdmissions) {
      await tx.admission.update({ where: { id: a.id }, data: { dischargedAt: new Date() } });
      await tx.bed.update({ where: { id: a.bedId }, data: { status: "AVAILABLE" } });
    }
    await tx.booking.updateMany({
      where: { encounterId: encounter.id, status: { in: ["Scheduled", "In progress"] } },
      data: { status: "Cancelled" },
    });
    await tx.encounter.update({ where: { id: encounter.id }, data: { status: "CANCELLED" } });
  });

  await logAction({ userId: req.user!.id, action: "encounter.force_cancelled", entityType: "Encounter", entityId: encounter.id });
  res.json({ ok: true });
});

/**
 * POST /:id/resync-payment
 * Fixes the specific inconsistency where a Payment record exists (money
 * was recorded) but the encounter's status/queue never advanced — the
 * visit stays stuck showing as unpaid even though it isn't. Safe to run
 * any time: it does nothing unless a payment genuinely exists and the
 * encounter isn't already discharged.
 */
router.post("/:id/resync-payment", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const encounter = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  const payment = await prisma.payment.findUnique({ where: { encounterId: req.params.id } });
  if (!payment) return res.status(404).json({ error: "No payment record exists for this visit — there's nothing to resync." });

  if (encounter.status === "DISCHARGED") {
    return res.status(400).json({ error: "This visit is already marked discharged — nothing to fix." });
  }

  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.updateMany({
      where: { encounterId: encounter.id, status: { in: ["WAITING", "CLAIMED"] } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.encounter.update({
      where: { id: encounter.id },
      data: { status: "DISCHARGED", dischargedAt: new Date() },
    });
  });

  await logAction({ userId: req.user!.id, action: "encounter.payment_resynced", entityType: "Encounter", entityId: encounter.id });
  res.json({ ok: true });
});

export default router;
