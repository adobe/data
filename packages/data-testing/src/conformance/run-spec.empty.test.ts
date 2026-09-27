// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runSpec } from "./run-spec.js";

// Features with empty State and no pure transforms still call `runSpec` from a
// dedicated `spec.test.ts`. Discovery with zero case modules must not leave the
// file suite-less (Vitest: "No test suite found"). This file is the regression:
// it is only this call — if empty discovery failed, vitest would fail the file.
runSpec({
  state: { create: () => ({}) },
  transitions: {},
});
