import { config } from "dotenv";
config({ path: ".env.local" });
import { reconcileSessions } from "../src/lib/sessions";
import { cleanup } from "../src/lib/workspace";
let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  let runs = 0;
  while (!stopping) {
    try {
      await reconcileSessions();
      if (runs++ % 360 === 0) await cleanup();
    } catch {
      console.error(
        "Maintenance failed; reservations remain locked. Check service connectivity.",
      );
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
main().catch(() => process.exit(1));
