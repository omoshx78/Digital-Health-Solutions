import { prisma } from "../db";

// Generates the next Medical Record Number from a Postgres sequence, so
// concurrent registrations (two receptionists, or a receptionist and a
// self-registering patient, at the same moment) can never collide.
// Create the sequence once via:
//   CREATE SEQUENCE mrn_seq START 1001;
export async function nextMrn(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('mrn_seq') as nextval`
  );
  return `MRN-${rows[0].nextval}`;
}
