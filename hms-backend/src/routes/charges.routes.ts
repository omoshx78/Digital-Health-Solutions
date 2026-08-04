import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { logAction } from "../utils/audit";

const router = Router();

/**
 * GET /charges?category=Laboratory
 * Any authenticated staff member can read the active price list — this is
 * what populates the lab test picker, the consultation fee lookup, etc.
 * Admins can pass ?includeInactive=true to see deactivated items too
 * (for the Pricing management screen).
 */
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const category = req.query.category as string | undefined;
  const includeInactive = req.query.includeInactive === "true" && req.user!.role === "ADMIN";

  const items = await prisma.chargeCatalogItem.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json(items);
});

const createSchema = z.object({
  category: z.enum(["Consultation", "Laboratory", "Other"]),
  name: z.string().min(1),
  price: z.number().min(0),
});

/** POST /charges — admin adds a brand-new chargeable item (e.g. a new lab test) */
router.post("/", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const item = await prisma.chargeCatalogItem.create({ data: parsed.data });
  await logAction({ userId: req.user!.id, action: "charge.created", entityType: "ChargeCatalogItem", entityId: item.id, details: parsed.data });
  res.status(201).json(item);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  active: z.boolean().optional(),
});

/**
 * PATCH /charges/:id — admin adjusts a price, renames an item, or
 * deactivates it. Items with a system `code` (the two consultation fees)
 * can have their price/name changed, but can't be deactivated — the
 * consultation flow depends on them always being available.
 */
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nothing to update" });

  const existing = await prisma.chargeCatalogItem.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Charge not found" });
  if (existing.code && parsed.data.active === false) {
    return res.status(400).json({ error: "This is a system-required fee and can't be deactivated — you can still adjust its price" });
  }

  const item = await prisma.chargeCatalogItem.update({ where: { id: req.params.id }, data: parsed.data });
  await logAction({ userId: req.user!.id, action: "charge.updated", entityType: "ChargeCatalogItem", entityId: item.id, details: parsed.data });
  res.json(item);
});

export default router;
