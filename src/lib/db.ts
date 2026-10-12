import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as liteDrizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { sql, type SQL } from "drizzle-orm";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { productionCheck, settings } from "./config";
export { sql };
export interface Executor {
  execute<T extends Record<string, unknown> = Record<string, unknown>>(
    query: SQL,
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
}
const globalDb = globalThis as unknown as { rev3Database?: Promise<Database> };
export async function database(): Promise<Database> {
  if (!globalDb.rev3Database)
    globalDb.rev3Database = (async () => {
      productionCheck();
      if (process.env.DATABASE_URL)
        return pgDrizzle(
          new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            connectionTimeoutMillis: 15000,
            idleTimeoutMillis: 10000,
            keepAlive: true,
            statement_timeout: 15000,
          }),
        ) as unknown as Database;
      if (settings().mode === "live" || process.env.NODE_ENV === "production")
        throw new Error("PostgreSQL DATABASE_URL is required");
      const lite = new PGlite(
        process.env.DEV_DATABASE_PATH ||
          path.join(process.cwd(), ".data", "rev3"),
      );
      for (const file of (await readdir(path.join(process.cwd(), "migrations")))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await lite.exec(
          await readFile(path.join(process.cwd(), "migrations", file), "utf8"),
        );
      return liteDrizzle(lite) as unknown as Database;
    })().catch((error) => {
      globalDb.rev3Database = undefined;
      throw error;
    });
  return globalDb.rev3Database;
}
export const rows = async <T extends Record<string, unknown>>(
  q: SQL,
  tx?: Executor,
): Promise<T[]> => (await (tx || (await database())).execute<T>(q)).rows;
export const one = async <T extends Record<string, unknown>>(
  q: SQL,
  tx?: Executor,
) => (await rows<T>(q, tx))[0];
export async function locked<T>(fn: (tx: Executor) => Promise<T>) {
  return (await database()).transaction(async (tx) => {
    // A single, persistent PostgreSQL row serialises capacity and entitlement decisions across replicas.
    await tx.execute(sql`UPDATE control SET tick=tick+1 WHERE id=1`);
    return fn(tx);
  });
}
export const json = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;
