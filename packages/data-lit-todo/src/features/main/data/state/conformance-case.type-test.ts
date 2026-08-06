// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time only (no runtime tests): proves the `Effects` conformance shape
// accepts valid side-effect declarations and REJECTS invalid ones. `tsc` checks
// this file; vitest does not run it (it is not a `.test.ts`). If any
// `@ts-expect-error` below stops erroring, or any positive stops compiling, the
// build fails — which is the point.
import type { AnalyticsService } from "../../services/analytics-service/analytics-service.js";
import type { Effects } from "./conformance-case.js";

// A representative transition arg shape: plain data + one injected service.
type Args = { readonly name: string; readonly complete?: boolean; readonly analytics: AnalyticsService };

// ===== POSITIVE — must compile =====
const ordered: Effects<Args> = { analytics: [["todoCreated", { name: "a" }], ["todoToggled"]] };
const anyOrder: Effects<Args> = { analytics: new Set([["todoToggled"] as const, ["allTodosCleared"] as const]) };
const noArgMethod: Effects<Args> = { analytics: [["displayCompletedToggled"]] };
const empty: Effects<Args> = {};
void ordered; void anyOrder; void noArgMethod; void empty;

// ===== NEGATIVE — each must error =====
const badMethod: Effects<Args> = {
  // @ts-expect-error - "noSuchMethod" is not a method of AnalyticsService
  analytics: [["noSuchMethod", { name: "a" }]],
};
const badArgs: Effects<Args> = {
  // @ts-expect-error - todoCreated takes { name: string }, not { count }
  analytics: [["todoCreated", { count: 1 }]],
};
const missingArgs: Effects<Args> = {
  // @ts-expect-error - todoCreated requires its args element
  analytics: [["todoCreated"]],
};
const extraArg: Effects<Args> = {
  // @ts-expect-error - todoToggled takes no args
  analytics: [["todoToggled", { name: "a" }]],
};
const dataKey: Effects<Args> = {
  // @ts-expect-error - "name" is a data arg, not a service
  name: [["todoCreated", { name: "a" }]],
};
void badMethod; void badArgs; void missingArgs; void extraArg; void dataKey;
