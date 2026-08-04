import { Router } from "express";
import { Department } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { logAction } from "../utils/audit";

const router = Router();

const VALID_DEPARTMENTS = ["TRIAGE", "CONSULTATION", "LABORATORY", "PHARMACY", "CASHIER", "THEATRE", "WARD"];

/**
 * GET /queue/:department
 * Shared queue view for a department. Returns:
 *  - waiting: unclaimed patients anyone in this department can pick up
 *  - mine: patients the logged-in staff member has already claimed
 * Multiple doctors/pharmacists/etc. hitting this endpoint all see the same
 * "waiting" list, and it shrinks in real time as colleagues claim patients.
 */
router.get("/:department", requireAuth, async (req: AuthedRequest, res) => {
  const department = req.params.department.toUpperCase();
  if (!VALID_DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: `Unknown department "${req.params.department}"` });
  }

  const [waiting, mine] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { department: department as Department, status: "WAITING" },
      include: {
        encounter: {
          include: {
            patient: true,
            triage: true,
            labOrders: true,
            consultations: true,
            prescriptions: { include: { item: true } },
            billingItems: true,
            notes: { orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.queueEntry.findMany({
      where: { department: department as Department, status: "CLAIMED", claimedById: req.user!.id },
      include: {
        encounter: {
          include: {
            patient: true,
            triage: true,
            labOrders: true,
            consultations: true,
            prescriptions: { include: { item: true } },
            billingItems: true,
            notes: { orderBy: { createdAt: "asc" } },
          },
        },
      },
      orderBy: { claimedAt: "asc" },
    }),
  ]);

  res.json({ waiting, mine });
});

/**
 * POST /queue/:id/claim
 * Atomically claims a waiting patient. Uses updateMany with a status guard
 * so that if two staff click "pick" on the same patient at the same
 * millisecond, only one of them actually gets it — the loser gets a 409
 * and should refresh their queue view instead of proceeding.
 */
router.post("/:id/claim", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;

  const result = await prisma.queueEntry.updateMany({
    where: { id, status: "WAITING" },
    data: { status: "CLAIMED", claimedById: req.user!.id, claimedAt: new Date() },
  });

  if (result.count === 0) {
    return res.status(409).json({
      error: "This patient was just claimed by someone else, or is no longer waiting. Refresh the queue.",
    });
  }

  const entry = await prisma.queueEntry.findUnique({
    where: { id },
    include: {
      encounter: {
        include: { patient: true, triage: true, labOrders: true, consultations: true, prescriptions: { include: { item: true } }, billingItems: true, notes: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  await logAction({
    userId: req.user!.id,
    action: "queue.claim",
    entityType: "QueueEntry",
    entityId: id,
    details: { department: entry?.department, encounterId: entry?.encounterId },
  });

  res.json(entry);
});

/**
 * POST /queue/:id/release
 * Puts a claimed patient back into the shared waiting pool — e.g. a doctor
 * gets pulled into an emergency and needs to hand the patient back.
 * Only the person who claimed it (or an admin) can release it.
 */
router.post("/:id/release", requireAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;

  const entry = await prisma.queueEntry.findUnique({ where: { id } });
  if (!entry) return res.status(404).json({ error: "Queue entry not found" });
  if (entry.status !== "CLAIMED") {
    return res.status(400).json({ error: "This patient isn't currently claimed" });
  }
  if (entry.claimedById !== req.user!.id && req.user!.role !== "ADMIN") {
    return res.status(403).json({ error: "Only the staff member who claimed this patient can release them" });
  }

  const updated = await prisma.queueEntry.update({
    where: { id },
    data: { status: "WAITING", claimedById: null, claimedAt: null },
  });

  await logAction({
    userId: req.user!.id,
    action: "queue.release",
    entityType: "QueueEntry",
    entityId: id,
  });

  res.json(updated);
});

export default router;
