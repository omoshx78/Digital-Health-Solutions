import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx ts-node prisma/restore-admin-script.ts you@example.com");
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN", active: true },
    select: { id: true, name: true, email: true, role: true, active: true },
  }).catch((err) => {
    console.error(`Could not find/update a user with email ${email}`);
    console.error(err.message);
    return null;
  });

  if (user) {
    console.log("Restored:", user);
  }
}

main().finally(() => prisma.$disconnect());
