import { prisma } from "../db";

// Generates the next Medical Record Number from a Postgres sequence, so
// concurrent registrations (two receptionists, or a receptionist and a
// self-registering patient, at the same moment) can never collide.
// The sequence is created by the init migration and the seed script; the
// guard below also creates it on first use so a fresh database can't break
// patient registration.
let sequenceReady = false;

export async function nextMrn(): Promise<string> {
  if (!sequenceReady) {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS mrn_seq START 1001;`);
    sequenceReady = true;
  }
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('mrn_seq') as nextval`
  );
  return `MRN-${rows[0].nextval}`;
}
