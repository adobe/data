// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time only (no runtime tests): proves the shared `Effects` conformance
// shape accepts valid side-effect declarations and REJECTS invalid ones, ONCE for
// the whole library rather than per feature. `tsc` checks this file; vitest does
// not run it (it is not a `.test.ts`). If any `@ts-expect-error` stops erroring, or
// any positive stops compiling, the build fails — which is the point.
import type { Effects } from "./types.js";

// A representative injected service, and a transition arg shape: plain data + the
// service. (A stand-in for any feature's `SomethingService` — the type machinery
// is identical, which is exactly why this test lives here and not per feature.)
interface AnalyticsService {
  readonly serviceName: "analytics";
  todoCreated(input: { readonly name: string }): void;
  todoToggled(): void;
  allTodosCleared(): void;
  displayCompletedToggled(): void;
}
type Args = { readonly name: string; readonly complete?: boolean; readonly analytics: AnalyticsService };

// ===== POSITIVE — must compile =====
const ordered: Effects<Args> = { analytics: [["todoCreated", { name: "a" }], ["todoToggled"]] };
const anyOrder: Effects<Args> = {
  analytics: new Set([["todoToggled"] as const, ["allTodosCleared"] as const]),
};
const noArgMethod: Effects<Args> = { analytics: [["displayCompletedToggled"]] };
const empty: Effects<Args> = {};
void ordered;
void anyOrder;
void noArgMethod;
void empty;

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
void badMethod;
void badArgs;
void missingArgs;
void extraArg;
void dataKey;
