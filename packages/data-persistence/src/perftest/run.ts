// © 2026 Adobe. MIT License. See /LICENSE for details.

import { runAll } from "./perf-harness.js";
import { persistenceScenarios } from "./persistence-perf.js";

/**
 * Persistence perftest entry point.
 *
 * Run with:
 *
 *     pnpm --filter @adobe/data-persistence run perf
 *
 * The runner uses the in-process transport so wall-time numbers
 * exclude postMessage overhead and isolate the persistence
 * service's own per-tx cost. Worker-thread / web-worker numbers
 * will add 1–10 μs of postMessage round-trip per op on top of
 * what's reported here.
 */
const main = async (): Promise<void> => {
    console.log("@adobe/data-persistence perftest");
    console.log("================================");
    console.log("(in-process transport; reported numbers exclude postMessage overhead)");
    console.log("");
    await runAll(persistenceScenarios);
};

main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
