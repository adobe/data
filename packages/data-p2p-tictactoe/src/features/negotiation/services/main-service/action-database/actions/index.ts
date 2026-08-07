// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The `actions` plugin facet. Only the capability-orchestration verbs (the
// UI-facing actions that drive the imperative `connection` service) are
// registered here.
//
// The per-transition actions (`start-host-signaling.ts`, `set-offer-code.ts`, …
// — the same-named app-facing realization of each `data/state` transition) are
// deliberately NOT re-exported into the facet: registering them would grow the
// composed database's `actions`/`transactions` type past tsc's instantiation
// budget (Database.Plugin extends is quadratic), which silently degrades the
// inferred restricted-service type the `ui/` binds to. They live beside this
// barrel as plain functions and are exercised directly by
// `conformance/actions.test.ts` — exactly how the reference runner imports and
// calls action functions (never through `db.actions`). The UI never dispatches
// them (it uses `transactions.*` and the orchestration verbs), so keeping them
// unregistered costs nothing at runtime.
export * from "./configure.js";
export * from "./start-host.js";
export * from "./start-join.js";
export * from "./submit-answer.js";
export * from "./generate-answer.js";
export * from "./reconnect.js";
export * from "./dispose.js";
