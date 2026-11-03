import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue } from "../utils/workflow";
import { logAction } from "../utils/audit";
import { nextMrn } from "../utils/mrn";

const router = Router();

/**
 * Radiology serves patients referred from other clinics. The flow is:
 *
 *   Reception registers the referral  ->  RADIOLOGY queue
 *   Radiologist claims, performs exams, records findings
 *       -> exams are billed, patient released to the RECEPTION queue
 *   Reception clears payment (cash / insurance)  ->  visit closed
 */

const newPatientSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  dob: z.string().datetime().optional(),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceNo: z.string().optional(),
});

const referralSchema = z
  .object({
    patientId: z.string().optional(),
    newPatient: newPatientSchema.optional(),
    referringFacility: z.string().min(1, "Enter the referring clinic / facility"),
    referringClinician: z.string().optional(),
    clinicalInfo: z.string().optional(),
    examIds: z.array(z.string()).min(1, "Select at least one examination"),
    priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).default("NORMAL"),
  })
  .refine((d) => !!d.patientId !== !!d.newPatient, {
    message: "Choose an existing patient or enter a new patient's details",
  });

/**
 * POST /radiology/referrals
 * Reception registers a patient referred from another clinic and sends
 * them straight to the RADIOLOGY queue (no triage, no consultation).
 * Exam prices are looked up server-side from the Radiology price list.
 */
router.post("/referrals", requireAuth, requireRole("RECEPTIONIST"), async (req: AuthedRequest, res) => {
  const parsed = referralSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const examIds = Array.from(new Set(d.examIds));
  const exams = await prisma.chargeCatalogItem.findMany({
    where: { id: { in: examIds }, category: "Radiology", active: true },
  });
  if (exams.length !== examIds.length) {
    return res.status(400).json({ error: "One or more selected examinations are no longer available" });
  }

  if (d.patientId) {
    const existing = await prisma.patient.findUnique({ where: { id: d.patientId } });
    if (!existing) return res.status(404).json({ error: "Patient not found" });
  }

  const result = await prisma.$transaction(async (tx) => {
    let patientId = d.patientId;
    if (!patientId && d.newPatient) {
      const mrn = await nextMrn();
      const p = d.newPatient;
      const created = await tx.patient.create({
        data: {
          mrn,
          firstName: p.firstName,
          lastName: p.lastName,
          gender: p.gender,
          dob: p.dob ? new Date(p.dob) : undefined,
          phone: p.phone,
          nationalId: p.nationalId,
          insuranceProvider: p.insuranceProvider,
          insuranceNo: p.insuranceNo,
        },
      });
      patientId = created.id;
    }

    const encounter = await tx.encounter.create({
      data: {
        patientId: patientId as string,
        type: "RADIOLOGY_REFERRAL",
        status: "RADIOLOGY",
        chiefComplaint: d.clinicalInfo,
        referringFacility: d.referringFacility,
        referringClinician: d.referringClinician,
        registeredById: req.user!.id,
      },
    });

    for (const exam of exams) {
      await tx.radiologyOrder.create({
        data: {
          encounterId: encounter.id,
          examName: exam.name,
          price: exam.price,
          orderedById: req.user!.id,
        },
      });
    }

    await enqueue(tx, encounter.id, "RADIOLOGY", d.priority);
    const patient = await tx.patient.findUnique({ where: { id: patientId as string } });
    return { patient, encounter };
  });

  await logAction({
    userId: req.user!.id,
    action: "radiology.referral_registered",
    entityType: "Encounter",
    entityId: result.encounter.id,
    details: { referringFacility: d.referringFacility, exams: exams.map((e) => e.name) },
  });

  res.status(201).json(result);
});

const completeSchema = z.object({
  results: z
    .array(
      z.object({
        orderId: z.string(),
        findings: z.string().min(1, "Enter findings for every examination"),
        impression: z.string().optional(),
      })
    )
    .min(1),
  notes: z.string().optional(),
});

/**
 * POST /radiology/:encounterId/complete
 * The radiologist who claimed this patient records findings for every
 * pending exam. Exams are billed, and the patient is released to the
 * RECEPTION queue for payment clearance.
 */
router.post("/:encounterId/complete", requireAuth, requireRole("RADIOLOGIST"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.encounterId;
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { results, notes } = parsed.data;

  const entry = await prisma.queueEntry.findFirst({
    where: { encounterId, department: "RADIOLOGY", status: "CLAIMED", claimedById: req.user!.id },
  });
  if (!entry) return res.status(403).json({ error: "You must claim this patient from the radiology queue first" });

  const pending = await prisma.radiologyOrder.findMany({ where: { encounterId, status: "PENDING" } });
  const unknown = results.filter((r) => !pending.some((o) => o.id === r.orderId));
  if (unknown.length > 0) return res.status(400).json({ error: "One of the submitted exams isn't pending for this patient. Refresh and try again." });
  const missing = pending.filter((o) => !results.some((r) => r.orderId === o.id));
  if (missing.length > 0) return res.status(400).json({ error: `Enter findings for: ${missing.map((o) => o.examName).join(", ")}` });

  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      const order = pending.find((o) => o.id === r.orderId)!;
      await tx.radiologyOrder.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          findings: r.findings,
          impression: r.impression || null,
          performedById: req.user!.id,
          completedAt: new Date(),
        },
      });
      await tx.billingItem.create({
        data: { encounterId, description: `Radiology: ${order.examName}`, amount: order.price, category: "Radiology" },
      });
    }
    if (notes) {
      await tx.encounterNote.create({
        data: { encounterId, department: "Radiology", authorId: req.user!.id, note: notes },
      });
    }
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.encounter.update({ where: { id: encounterId }, data: { status: "PAYMENT_CLEARANCE" } });
    await enqueue(tx, encounterId, "RECEPTION", entry.priority);
  });

  await logAction({
    userId: req.user!.id,
    action: "radiology.completed",
    entityType: "Encounter",
    entityId: encounterId,
    details: { exams: pending.map((o) => o.examName) },
  });

  res.json({ ok: true });
});

const clearanceSchema = z.object({
  method: z.enum(["CASH", "INSURANCE"]),
  insuranceProvider: z.string().optional(),
  claimNo: z.string().optional(),
});

/**
 * POST /radiology/:encounterId/clearance
 * Reception (or the cashier) clears payment for a radiology referral once
 * the radiologist has released the patient. Mirrors the cashier flow:
 * cash is collected immediately; insurance opens a claim that is settled
 * later under Reports -> Insurance claims. The visit is then closed.
 */
router.post("/:encounterId/clearance", requireAuth, requireRole("RECEPTIONIST", "CASHIER"), async (req: AuthedRequest, res) => {
  const encounterId = req.params.encounterId;
  const parsed = clearanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { method, insuranceProvider, claimNo } = parsed.data;

  const entry = await prisma.queueEntry.findFirst({
    where: { encounterId, department: "RECEPTION", status: "CLAIMED", claimedById: req.user!.id },
  });
  if (!entry) return res.status(403).json({ error: "You must pick this patient from the payment clearance queue first" });

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
    await tx.encounter.update({ where: { id: encounterId }, data: { status: "DISCHARGED", dischargedAt: new Date() } });
    await tx.queueEntry.update({ where: { id: entry.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    return p;
  });

  await logAction({
    userId: req.user!.id,
    action: isInsurance ? "payment.claim_submitted" : "payment.cash_received",
    entityType: "Encounter",
    entityId: encounterId,
    details: { amount: total, source: "radiology_clearance" },
  });

  res.status(201).json(payment);
});

/**
 * GET /radiology/recent
 * Visits with radiology exams completed in the last 7 days — so the
 * radiologist can reprint a report, and reception can find a patient who
 * comes back for their results.
 */
router.get("/recent", requireAuth, requireRole("RADIOLOGIST", "RECEPTIONIST", "CASHIER"), async (_req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const encounters = await prisma.encounter.findMany({
    where: { radiologyOrders: { some: { status: "COMPLETED", completedAt: { gte: since } } } },
    include: { patient: true, radiologyOrders: true },
    orderBy: { registeredAt: "desc" },
    take: 50,
  });
  res.json(encounters);
});

export default router;
