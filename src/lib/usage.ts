import { randomUUID } from "node:crypto";
import { locked, one, sql } from "./db";
import { settings } from "./config";
import { requireThat } from "./errors";
// Reserve before calling paid endpoints. Failed requests retain their conservative
// cost estimate because a timeout does not prove that the provider did not bill.
export async function reserveProviderCost(estimatedGBP: number) {
  await locked(async (tx) => {
    const month = new Date().toISOString().slice(0, 7);
    const usage = await one<{ cost: string }>(
      sql`SELECT coalesce(sum(estimated_gbp),0) AS cost FROM usage_ledger WHERE month=${month}`,
      tx,
    );
    requireThat(
      Number(usage.cost) + estimatedGBP <= settings().budget,
      503,
      "Live co-creation testing is currently at capacity. You can still review your setup and share feedback.",
    );
    await tx.execute(
      sql`INSERT INTO usage_ledger(session_id,month,reserved_seconds,actual_seconds,estimated_gbp,settled) VALUES(${randomUUID()},${month},0,0,${estimatedGBP},true)`,
    );
  });
}
