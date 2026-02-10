// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as vanilla_tests from "./vanilla-perf.js";
import * as horizon_tests from "./horizon-perf.js";
import * as ecs_tests from "./ecs-perf.js";
import { runTests } from "./perf-test.js";

export function run() {
  runTests({
    ...ecs_tests,
    ...vanilla_tests,
    // ...horizon_tests,
  });
}

if (typeof globalThis.process === "object" && import.meta.url === `file://${process?.argv[1]}`) {
  run();
}
