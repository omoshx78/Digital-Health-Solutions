import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { enqueue } from "../utils/workflow";
import { logAction } from "../utils/audit";
import { nextMrn } from "../utils/mrn";

const router = Router();

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().datetime().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceNo: z.string().optional(),
  chiefComplaint: z.string().optional(),
  type: z.enum(["OUTPATIENT", "INPATIENT", "EMERGENCY"]).default("OUTPATIENT"),
});

/**
 * POST /patients/register
 * Registers a brand-new patient and immediately opens their first
 * encounter, which enters the TRIAGE queue for any nurse to pick up.
 */
router.post("/register", requireAuth, requireRole("RECEPTIONIST"), async (req: AuthedRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const mrn = await nextMrn();
    const patient = await tx.patient.create({
      data: {
        mrn,
        firstName: d.firstName,
        lastName: d.lastName,
        dob: d.dob ? new Date(d.dob) : undefined,
        gender: d.gender,
        phone: d.phone,
        nationalId: d.nationalId,
        insuranceProvider: d.insuranceProvider,
        insuranceNo: d.insuranceNo,
      },
    });
    const encounter = await tx.encounter.create({
      data: {
        patientId: patient.id,
        type: d.type,
        status: "TRIAGE",
        chiefComplaint: d.chiefComplaint,
        registeredById: req.user!.id,
      },
    });
    await enqueue(tx, encounter.id, "TRIAGE");
    return { patient, encounter };
  });

  await logAction({
    userId: req.user!.id,
    action: "patient.register",
    entityType: "Patient",
    entityId: result.patient.id,
    details: { encounterId: result.encounter.id },
  });

  res.status(201).json(result);
});

/**
 * POST /patients/:id/visit
 * A returning patient (already has an MRN) is starting a new encounter —
 * avoids creating duplicate patient records for people who've been seen
 * before.
 */
router.post("/:id/visit", requireAuth, requireRole("RECEPTIONIST"), async (req: AuthedRequest, res) => {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) return res.status(404).json({ error: "Patient not found" });

  const type = ["OUTPATIENT", "INPATIENT", "EMERGENCY"].includes(req.body?.type) ? req.body.type : "OUTPATIENT";
  const chiefComplaint = typeof req.body?.chiefComplaint === "string" ? req.body.chiefComplaint : undefined;

  const encounter = await prisma.$transaction(async (tx) => {
    const enc = await tx.encounter.create({
      data: {
        patientId: patient.id,
        type,
        status: "TRIAGE",
        chiefComplaint,
        registeredById: req.user!.id,
      },
    });
    await enqueue(tx, enc.id, "TRIAGE");
    return enc;
  });

  res.status(201).json(encounter);
});

/**
 * GET /patients/pending-self-registrations
 * Patients who registered themselves via the QR code form and are
 * waiting for reception to review and confirm their details before they
 * enter the Triage queue.
 */
router.get("/pending-self-registrations", requireAuth, requireRole("RECEPTIONIST"), async (_req, res) => {
  const pending = await prisma.encounter.findMany({
    where: { selfRegistered: true, status: "REGISTERED" },
    include: { patient: true },
    orderBy: { registeredAt: "asc" },
  });
  res.json(pending);
});

/** GET /patients?search=name-or-mrn-or-phone — for reception to find returning patients */
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const search = (req.query.search as string) || "";
  const take = Math.min(Number(req.query.take) || 25, 2000);
  const patients = await prisma.patient.findMany({
    where: search
      ? {
          OR: [
            { mrn: { contains: search, mode: "insensitive" } },
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { nationalId: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: search ? [{ firstName: "asc" }, { lastName: "asc" }] : { createdAt: "desc" },
    take,
  });
  res.json(patients);
});

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dob: z.string().datetime().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  phone: z.string().optional(),
  nationalId: z.string().optional(),
  address: z.string().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceNo: z.string().optional(),
});

/** PATCH /patients/:id — reception corrects/completes details, e.g. before confirming a self-registration */
router.patch("/:id", requireAuth, requireRole("RECEPTIONIST"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nothing to update" });

  const patient = await prisma.patient.update({
    where: { id: req.params.id },
    data: { ...parsed.data, dob: parsed.data.dob ? new Date(parsed.data.dob) : undefined },
  });
  res.json(patient);
});

/** GET /patients/:id — full history for the patient timeline view */
router.get("/:id", requireAuth, async (req, res) => {
  const patient = await prisma.patient.findUnique({
    where: { id: req.params.id },
    include: {
      encounters: {
        orderBy: { registeredAt: "desc" },
        include: {
          triage: true,
          consultations: true,
          labOrders: true,
          prescriptions: { include: { item: true } },
          billingItems: true,
          payment: { include: { installments: { orderBy: { recordedAt: "asc" } } } },
          admissions: { include: { bed: { include: { ward: true } } }, orderBy: { admittedAt: "asc" } },
          notes: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patient);
});

export default router;
