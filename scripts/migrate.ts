import { config } from "dotenv";
config({ path: ".env.local" });
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "No DATABASE_URL: development embedded PostgreSQL migrates on first start.",
    );
    return;
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73931001)");
    for (const file of (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await client.query(await readFile(`migrations/${file}`, "utf8"));
    await client.query("COMMIT");
    console.log("Migrations applied.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  console.error("Migration failed. Check database connectivity and schema.");
  process.exit(1);
});
