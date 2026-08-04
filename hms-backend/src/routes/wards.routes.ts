import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue } from "../utils/workflow";
import { logAction } from "../utils/audit";

const router = Router();

/** GET /wards — occupancy overview */
router.get("/", requireAuth, async (_req, res) => {
  const wards = await prisma.ward.findMany({
    include: { beds: { include: { admissions: { where: { dischargedAt: null }, include: { encounter: { include: { patient: true } } } } } } },
  });
  res.json(wards);
});

const admitSchema = z.object({
  encounterId: z.string(),
  bedId: z.string(),
  admittingDiagnosis: z.string().optional(),
  expectedDischarge: z.string().datetime().optional(),
});

/** POST /admissions — admit a patient to a specific bed */
router.post("/admissions", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const parsed = admitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const bed = await prisma.bed.findUnique({ where: { id: d.bedId } });
  if (!bed) return res.status(404).json({ error: "Bed not found" });
  if (bed.status !== "AVAILABLE") return res.status(409).json({ error: `Bed is currently ${bed.status.toLowerCase()}` });

  const encounter = await prisma.encounter.findUnique({ where: { id: d.encounterId } });
  if (!encounter) return res.status(404).json({ error: "Encounter not found" });

  // If this patient was referred here from a doctor's consultation review,
  // there's a WARD queue entry waiting — it must be claimed by whoever is
  // admitting (or an admin) before the admission can proceed. Direct,
  // unreferred admissions (no queue entry at all) are still allowed.
  const referral = await prisma.queueEntry.findFirst({
    where: { encounterId: d.encounterId, department: "WARD", status: { in: ["WAITING", "CLAIMED"] } },
  });
  if (referral) {
    if (referral.status === "WAITING") {
      return res.status(403).json({ error: "Claim this referral from the Wards queue before admitting" });
    }
    if (referral.claimedById !== req.user!.id && req.user!.role !== "ADMIN") {
      return res.status(403).json({ error: "Only the staff member who claimed this referral can admit the patient" });
    }
  }

  const admission = await prisma.$transaction(async (tx) => {
    const a = await tx.admission.create({
      data: {
        encounterId: d.encounterId,
        bedId: d.bedId,
        admittedById: req.user!.id,
        admittingDiagnosis: d.admittingDiagnosis,
        expectedDischarge: d.expectedDischarge ? new Date(d.expectedDischarge) : undefined,
      },
    });
    await tx.bed.update({ where: { id: d.bedId }, data: { status: "OCCUPIED" } });
    await tx.encounter.update({ where: { id: d.encounterId }, data: { status: "ADMITTED", type: "INPATIENT" } });
    if (referral) {
      await tx.queueEntry.update({ where: { id: referral.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
    return a;
  });

  await logAction({ userId: req.user!.id, action: "ward.admitted", entityType: "Admission", entityId: admission.id });
  res.status(201).json(admission);
});

const noteSchema = z.object({ note: z.string().min(1) });

/** POST /admissions/:id/notes — nursing/doctor round notes during the stay */
router.post("/admissions/:id/notes", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Note text is required" });

  const admission = await prisma.admission.findUnique({ where: { id: req.params.id } });
  if (!admission) return res.status(404).json({ error: "Admission not found" });

  const note = await prisma.nursingNote.create({
    data: { admissionId: admission.id, note: parsed.data.note, recordedById: req.user!.id },
  });
  res.status(201).json(note);
});

/**
 * POST /admissions/:id/discharge
 * Charges for the length of stay (ward's daily rate × nights stayed,
 * minimum 1 day), frees the bed, and sends the patient to the Cashier
 * queue for final billing — actual encounter discharge happens once
 * payment is recorded, same as the outpatient flow.
 */
router.post("/admissions/:id/discharge", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const admission = await prisma.admission.findUnique({
    where: { id: req.params.id },
    include: { bed: { include: { ward: true } } },
  });
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.dischargedAt) return res.status(400).json({ error: "This admission is already discharged" });

  const dischargedAt = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const nights = Math.max(1, Math.ceil((dischargedAt.getTime() - admission.admittedAt.getTime()) / msPerDay));
  const wardCharge = Number(admission.bed.ward.dailyRate) * nights;

  await prisma.$transaction(async (tx) => {
    await tx.admission.update({ where: { id: admission.id }, data: { dischargedAt } });
    await tx.bed.update({ where: { id: admission.bedId }, data: { status: "AVAILABLE" } });
    if (wardCharge > 0) {
      await tx.billingItem.create({
        data: {
          encounterId: admission.encounterId,
          description: `Ward: ${admission.bed.ward.name} — ${nights} night(s) @ ${admission.bed.ward.dailyRate}`,
          amount: wardCharge,
          category: "Ward/Admission",
        },
      });
    }
    await tx.encounter.update({ where: { id: admission.encounterId }, data: { status: "CASHIER" } });
    await enqueue(tx, admission.encounterId, "CASHIER");
  });

  await logAction({
    userId: req.user!.id,
    action: "ward.discharged_to_billing",
    entityType: "Admission",
    entityId: admission.id,
    details: { nights, wardCharge },
  });
  res.json({ ok: true, nights, wardCharge });
});

const orderMedicineSchema = z.object({
  prescriptions: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).min(1),
});

/**
 * POST /admissions/:id/order-medicine
 * A ward nurse or doctor orders medication for an admitted patient. This
 * puts the request in the Pharmacy queue exactly like an outpatient
 * prescription — the pharmacist dispenses it the same way — but because
 * the patient is still admitted, dispensing won't route them to the
 * cashier; they stay in the ward and this gets billed at discharge.
 */
router.post("/admissions/:id/order-medicine", requireAuth, requireRole("DOCTOR", "WARD_NURSE"), async (req: AuthedRequest, res) => {
  const parsed = orderMedicineSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const admission = await prisma.admission.findUnique({ where: { id: req.params.id } });
  if (!admission) return res.status(404).json({ error: "Admission not found" });
  if (admission.dischargedAt) return res.status(400).json({ error: "This admission has already ended" });

  const items = await prisma.inventoryItem.findMany({ where: { id: { in: parsed.data.prescriptions.map((p) => p.itemId) } } });
  if (items.length !== parsed.data.prescriptions.length) {
    return res.status(400).json({ error: "One or more selected items don't exist in inventory" });
  }

  await prisma.$transaction(async (tx) => {
    for (const rx of parsed.data.prescriptions) {
      await tx.prescription.create({ data: { encounterId: admission.encounterId, itemId: rx.itemId, quantity: rx.quantity } });
    }
    await enqueue(tx, admission.encounterId, "PHARMACY");
  });

  await logAction({
    userId: req.user!.id,
    action: "ward.medicine_ordered",
    entityType: "Admission",
    entityId: admission.id,
    details: { items: parsed.data.prescriptions.length },
  });
  res.status(201).json({ ok: true });
});

export default router;
