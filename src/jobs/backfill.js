/**
 * Backfill entry shim (ADR 0009). An error rejects the top-level await, and Node exits 1 with the message.
 */
import { readConfig } from "./config.js";
import { runBackfill } from "./run-backfill.js";

const synced = await runBackfill(readConfig(process.env));
process.stdout.write(`Synced ${synced} companies\n`);
