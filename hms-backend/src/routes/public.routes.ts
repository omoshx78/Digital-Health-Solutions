import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { nextMrn } from "../utils/mrn";
import { logAction } from "../utils/audit";

const router = Router();

const selfRegisterSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dob: z.string().datetime().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  phone: z.string().min(1),
  nationalId: z.string().optional(),
  address: z.string().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinPhone: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insuranceNo: z.string().optional(),
  chiefComplaint: z.string().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "You must accept the consent form to register" }) }),
});

/**
 * POST /public/self-register
 * No login required — this is what the QR code at reception points to.
 * Creates the patient and their visit, but deliberately does NOT put them
 * in the Triage queue yet: the encounter sits as REGISTERED until a
 * receptionist reviews and confirms it via /encounters/:id/confirm-registration.
 * This is the only unauthenticated write endpoint in the whole system —
 * keep it minimal and keep validating everything strictly.
 */
router.post("/self-register", async (req, res) => {
  const parsed = selfRegisterSchema.safeParse(req.body);
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
        address: d.address,
        nextOfKinName: d.nextOfKinName,
        nextOfKinPhone: d.nextOfKinPhone,
        insuranceProvider: d.insuranceProvider,
        insuranceNo: d.insuranceNo,
      },
    });
    const encounter = await tx.encounter.create({
      data: {
        patientId: patient.id,
        type: "OUTPATIENT",
        status: "REGISTERED",
        chiefComplaint: d.chiefComplaint,
        selfRegistered: true,
        consentGivenAt: new Date(),
      },
    });
    return { patient, encounter };
  });

  await logAction({
    action: "patient.self_registered",
    entityType: "Patient",
    entityId: result.patient.id,
    details: { encounterId: result.encounter.id },
  });

  res.status(201).json({ mrn: result.patient.mrn, name: `${result.patient.firstName} ${result.patient.lastName}` });
});

export default router;
