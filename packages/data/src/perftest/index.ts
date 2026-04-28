// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as vanilla_tests from "./vanilla-perf.js";
import * as horizon_tests from "./horizon-perf.js";
import * as ecs1_tests from "./ecs1-perf.js";
import * as ecs2_tests from "./ecs2-perf.js";
import * as typed_buffer_tests from "./typed-buffer-perf.js";
import { runTests } from "./perf-test.js";

export function run() {
  runTests({
    ...ecs1_tests,
    ...ecs2_tests,
    ...vanilla_tests,
    ...horizon_tests,
    ...typed_buffer_tests,
  });
}

if (typeof globalThis.process === "object" && import.meta.url === `file://${process?.argv[1]}`) {
  run();
}
