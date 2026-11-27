import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

// SQLite: write-ahead logging lets the grid keep reading while uploads write, instead of waiting on a lock.
// It is stored in the database file, so one call is enough. Ignored on other databases.
void db.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => undefined);
