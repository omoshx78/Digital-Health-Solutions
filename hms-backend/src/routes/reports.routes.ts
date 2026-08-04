import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireRole } from "../middleware/roles";

const router = Router();

function periodRange(period: string | undefined): { gte: Date; lt: Date } | null {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { gte: start, lt: end };
  }
  return null; // "all"
}

/**
 * GET /reports/collections?period=today|month|all
 * Cash counts the moment it's received. Insurance is trickier now that
 * claims can be paid in installments: each ClaimPayment row is real money
 * received on a specific date, so that's what we sum for the period —
 * not the claim's overall status, which might still show "partially paid"
 * long after this particular installment came in.
 */
router.get("/collections", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const range = periodRange(req.query.period as string);

  const cashPayments = await prisma.payment.findMany({
    where: { method: "CASH", paidAt: range ? { gte: range.gte, lt: range.lt } : { not: null } },
    include: { encounter: { include: { patient: true, billingItems: true } } },
    orderBy: { paidAt: "desc" },
  });

  const claimPayments = await prisma.claimPayment.findMany({
    where: range ? { recordedAt: { gte: range.gte, lt: range.lt } } : undefined,
    include: { payment: { include: { encounter: { include: { patient: true } } } } },
    orderBy: { recordedAt: "desc" },
  });

  const cash = cashPayments.reduce((s, p) => s + p.encounter.billingItems.reduce((s2, i) => s2 + Number(i.amount), 0), 0);
  const insurance = claimPayments.reduce((s, cp) => s + Number(cp.amount), 0);

  const cashTransactions = cashPayments.map((p) => ({
    id: p.id,
    encounterId: p.encounterId,
    patientName: `${p.encounter.patient.firstName} ${p.encounter.patient.lastName}`,
    mrn: p.encounter.patient.mrn,
    amount: p.encounter.billingItems.reduce((s, i) => s + Number(i.amount), 0),
    paidAt: p.paidAt,
  }));

  const insuranceTransactions = claimPayments.map((cp) => ({
    id: cp.id,
    encounterId: cp.payment.encounterId,
    patientName: `${cp.payment.encounter.patient.firstName} ${cp.payment.encounter.patient.lastName}`,
    mrn: cp.payment.encounter.patient.mrn,
    amount: Number(cp.amount),
    paidAt: cp.recordedAt,
    insuranceProvider: cp.payment.insuranceProvider,
    claimNo: cp.payment.claimNo,
  }));

  // Revenue by department only makes sense for cash — for insurance,
  // billing-item categories aren't tied to a specific installment, so we
  // approximate using each cash bill's own categories only. This keeps
  // the breakdown honest rather than double-counting partially paid claims.
  const byCategory: Record<string, number> = {};
  for (const p of cashPayments) {
    for (const item of p.encounter.billingItems) {
      const cat = item.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + Number(item.amount);
    }
  }

  res.json({
    period: req.query.period || "all",
    totalCollected: cash + insurance,
    cash,
    insurancePaid: insurance,
    byCategory,
    transactionCount: cashTransactions.length + insuranceTransactions.length,
    cashTransactions,
    insuranceTransactions,
  });
});

/** GET /reports/claims — all insurance claims with current status and remaining balance (not period-limited, since claims linger) */
router.get("/claims", requireAuth, requireRole("CASHIER"), async (_req, res) => {
  const claims = await prisma.payment.findMany({
    where: { method: "INSURANCE" },
    include: { encounter: { include: { patient: true, billingItems: true } }, installments: { orderBy: { recordedAt: "asc" } } },
    orderBy: { claimSubmittedAt: "desc" },
  });

  const withTotals = claims.map((c) => {
    const amount = c.encounter.billingItems.reduce((s, i) => s + Number(i.amount), 0);
    const amountPaid = Number(c.amountPaid);
    return {
      ...c,
      amount,
      amountPaid,
      remaining: Math.max(0, amount - amountPaid),
      patientName: `${c.encounter.patient.firstName} ${c.encounter.patient.lastName}`,
      mrn: c.encounter.patient.mrn,
    };
  });

  const outstandingValue = withTotals
    .filter((c) => c.claimStatus !== "PAID" && c.claimStatus !== "REJECTED")
    .reduce((s, c) => s + c.remaining, 0);

  res.json({ claims: withTotals, outstandingValue });
});

/** GET /reports/insurance-providers — distinct provider names, for the report filter dropdown */
router.get("/insurance-providers", requireAuth, requireRole("CASHIER"), async (_req, res) => {
  const rows = await prisma.payment.findMany({
    where: { method: "INSURANCE", insuranceProvider: { not: null } },
    select: { insuranceProvider: true },
    distinct: ["insuranceProvider"],
  });
  res.json(rows.map((r) => r.insuranceProvider).filter(Boolean).sort());
});

/**
 * GET /reports/insurance-by-provider?provider=X&period=Y
 * Per-provider view: how much they've paid us (in the selected period,
 * across possibly-multiple installments) and how much is still pending
 * across all their claims (pending is a current snapshot, not period-bound
 * — an unpaid claim from three months ago is still pending today).
 */
router.get("/insurance-by-provider", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const provider = req.query.provider as string | undefined;
  if (!provider) return res.status(400).json({ error: "A provider is required" });
  const range = periodRange(req.query.period as string);

  const claims = await prisma.payment.findMany({
    where: { method: "INSURANCE", insuranceProvider: provider },
    include: { encounter: { include: { patient: true, billingItems: true } }, installments: { orderBy: { recordedAt: "asc" } } },
    orderBy: { claimSubmittedAt: "desc" },
  });

  const claimsWithTotals = claims.map((c) => {
    const amount = c.encounter.billingItems.reduce((s, i) => s + Number(i.amount), 0);
    const amountPaid = Number(c.amountPaid);
    return {
      id: c.id,
      encounterId: c.encounterId,
      patientName: `${c.encounter.patient.firstName} ${c.encounter.patient.lastName}`,
      mrn: c.encounter.patient.mrn,
      claimNo: c.claimNo,
      claimStatus: c.claimStatus,
      amount,
      amountPaid,
      remaining: Math.max(0, amount - amountPaid),
    };
  });

  const pendingNow = claimsWithTotals
    .filter((c) => c.claimStatus !== "PAID" && c.claimStatus !== "REJECTED")
    .reduce((s, c) => s + c.remaining, 0);

  const paymentsInPeriod = await prisma.claimPayment.findMany({
    where: {
      payment: { insuranceProvider: provider },
      ...(range ? { recordedAt: { gte: range.gte, lt: range.lt } } : {}),
    },
    include: { payment: { include: { encounter: { include: { patient: true } } } } },
    orderBy: { recordedAt: "desc" },
  });

  const paidInPeriod = paymentsInPeriod.reduce((s, p) => s + Number(p.amount), 0);
  const payments = paymentsInPeriod.map((p) => ({
    id: p.id,
    patientName: `${p.payment.encounter.patient.firstName} ${p.payment.encounter.patient.lastName}`,
    mrn: p.payment.encounter.patient.mrn,
    amount: Number(p.amount),
    recordedAt: p.recordedAt,
  }));

  res.json({
    provider,
    period: req.query.period || "all",
    paidInPeriod,
    pendingNow,
    claimCount: claims.length,
    claims: claimsWithTotals,
    payments,
  });
});

/** GET /reports/expenses?period=today|month|all */
router.get("/expenses", requireAuth, requireRole("CASHIER"), async (req, res) => {
  const range = periodRange(req.query.period as string);
  const expenses = await prisma.expense.findMany({
    where: range ? { date: { gte: range.gte, lt: range.lt } } : undefined,
    orderBy: { date: "desc" },
  });
  res.json({ expenses, total: expenses.reduce((s, e) => s + Number(e.amount), 0) });
});

const expenseSchema = z.object({
  date: z.string().datetime(),
  category: z.enum(["Drug & supply procurement", "Salaries & wages", "Utilities", "Equipment maintenance", "Transport", "Other"]),
  amount: z.number().min(0.01),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/expenses", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const expense = await prisma.expense.create({
    data: { ...parsed.data, date: new Date(parsed.data.date), recordedById: req.user!.id },
  });
  res.status(201).json(expense);
});

router.delete("/expenses/:id", requireAuth, requireRole("CASHIER"), async (req, res) => {
  await prisma.expense.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/** GET /reports/summary?period=today|month|all — the headline numbers for the Reports dashboard */
router.get("/summary", requireAuth, requireRole("CASHIER"), async (req: AuthedRequest, res) => {
  const period = (req.query.period as string) || "today";
  const range = periodRange(period);

  const [cashPayments, claimPayments, expenses, outstandingClaims] = await Promise.all([
    prisma.payment.findMany({
      where: { method: "CASH", paidAt: range ? { gte: range.gte, lt: range.lt } : { not: null } },
      include: { encounter: { include: { billingItems: true } } },
    }),
    prisma.claimPayment.findMany({
      where: range ? { recordedAt: { gte: range.gte, lt: range.lt } } : undefined,
    }),
    prisma.expense.findMany({ where: range ? { date: { gte: range.gte, lt: range.lt } } : undefined }),
    prisma.payment.findMany({
      where: { method: "INSURANCE", claimStatus: { in: ["SUBMITTED", "APPROVED", "PARTIALLY_PAID"] } },
      include: { encounter: { include: { billingItems: true } } },
    }),
  ]);

  const cash = cashPayments.reduce((s, p) => s + p.encounter.billingItems.reduce((s2, i) => s2 + Number(i.amount), 0), 0);
  const insurance = claimPayments.reduce((s, cp) => s + Number(cp.amount), 0);
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pendingClaims = outstandingClaims.reduce((s, c) => {
    const amount = c.encounter.billingItems.reduce((s2, i) => s2 + Number(i.amount), 0);
    return s + Math.max(0, amount - Number(c.amountPaid));
  }, 0);

  res.json({
    period,
    totalCollected: cash + insurance,
    cash,
    insurancePaid: insurance,
    pendingClaims,
    totalExpenses,
    net: cash + insurance - totalExpenses,
  });
});

export default router;
