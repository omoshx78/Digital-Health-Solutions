import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { logAction } from "../utils/audit";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required" });

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

const token = (jwt.sign as any)(
     { id: user.id, role: user.role, name: user.name },
     process.env.JWT_SECRET as string,
     { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
   );

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logAction({ userId: user.id, action: "auth.login", entityType: "User", entityId: user.id });

  res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "RECEPTIONIST", "NURSE", "DOCTOR", "LAB_TECH", "PHARMACIST", "CASHIER", "WARD_NURSE", "THEATRE_NURSE", "RADIOLOGIST"]),
});

// Only an existing admin can create staff accounts — run the seed script
// once to create the first admin.
router.post("/users", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { name, email, password, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "A user with this email already exists" });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash, role } });

  await logAction({
    userId: req.user!.id,
    action: "user.created",
    entityType: "User",
    entityId: user.id,
    details: { name, email, role },
  });

  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json(req.user);
});

/** GET /auth/users — list all staff accounts (admin only) */
router.get("/users", requireAuth, requireRole("ADMIN"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, lastLoginAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(users);
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "RECEPTIONIST", "NURSE", "DOCTOR", "LAB_TECH", "PHARMACIST", "CASHIER", "WARD_NURSE", "THEATRE_NURSE", "RADIOLOGIST"]).optional(),
  active: z.boolean().optional(),
});

/** PATCH /auth/users/:id — update a staff member's name/role/active status (admin only) */
router.patch("/users/:id", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nothing to update" });

  if (parsed.data.active === false && req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You can't deactivate your own account" });
  }
  if (parsed.data.role && parsed.data.role !== "ADMIN" && req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You can't change your own role away from admin" });
  }

  // Never allow the last active admin to be demoted or deactivated —
  // that's exactly the lockout scenario that's already happened once.
  const isRemovingAdminRights = (parsed.data.role && parsed.data.role !== "ADMIN") || parsed.data.active === false;
  if (isRemovingAdminRights) {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (target?.role === "ADMIN" && target.active) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: req.params.id } },
      });
      if (otherActiveAdmins === 0) {
        return res.status(400).json({ error: "This is the last active admin account — create another admin before changing this one" });
      }
    }
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  await logAction({
    userId: req.user!.id,
    action: "user.updated",
    entityType: "User",
    entityId: user.id,
    details: parsed.data,
  });

  res.json(user);
});

const resetPasswordSchema = z.object({ newPassword: z.string().min(8, "Password must be at least 8 characters") });

/** POST /auth/users/:id/reset-password — admin sets a new password for any staff member (e.g. onboarding, forgotten password) */
router.post("/users/:id/reset-password", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
  await logAction({ userId: req.user!.id, action: "user.password_reset", entityType: "User", entityId: req.params.id });
  res.json({ ok: true });
});

const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/** PATCH /auth/me/password — any logged-in user changes their own password, proving they know the current one */
router.patch("/me/password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changeOwnPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

/**
 * GET /auth/audit-logs — admin-only trail of who did what and when:
 * logins, user creation, role changes, password resets, and every other
 * action logged via logAction() throughout the app.
 */
router.get("/audit-logs", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const action = req.query.action as string | undefined;
  const logs = await prisma.auditLog.findMany({
    where: action ? { action: { contains: action, mode: "insensitive" } } : undefined,
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

export default router;
