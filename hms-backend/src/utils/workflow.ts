import { Department, Priority, PrismaClient } from "@prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Puts an encounter into a department's shared queue as WAITING, unless it's
 * already actively sitting there (WAITING or CLAIMED) — this stops duplicate
 * queue cards showing up if an action is retried.
 */
export async function enqueue(
  tx: TxClient,
  encounterId: string,
  department: Department,
  priority: Priority = "NORMAL"
) {
  const existingActive = await tx.queueEntry.findFirst({
    where: { encounterId, department, status: { in: ["WAITING", "CLAIMED"] } },
  });
  if (existingActive) return existingActive;

  return tx.queueEntry.create({
    data: { encounterId, department, priority, status: "WAITING" },
  });
}

/** Decide where a patient goes after consultation, based on what was ordered. */
export function nextAfterConsultation(hasLabOrders: boolean, hasPrescriptions: boolean): Department {
  if (hasLabOrders) return "LABORATORY";
  if (hasPrescriptions) return "PHARMACY";
  return "CASHIER";
}

/** After lab results are entered, the patient always goes back to the
 * doctor to review results — the doctor then decides pharmacy, ward, or
 * discharge via the consultation-review step. */
export function nextAfterLab(): Department {
  return "CONSULTATION";
}
