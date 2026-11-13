import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse one client per runtime instance (also in production: on Vercel each
// warm function instance keeps one client instead of opening new connections).
export const prisma = global.__prisma ?? new PrismaClient();
global.__prisma = prisma;
