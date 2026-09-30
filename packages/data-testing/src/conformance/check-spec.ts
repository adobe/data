// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runSpec } from "./run-spec.js";
import { adaptCases } from "./adapt-spec.js";
import type { Spec } from "./spec.js";

type AnyFn = (...args: never[]) => unknown;

// The pure-spec suite: run every case against its spec fn, with fresh recording
// doubles built from the `services` templates + each case's `responses`. Reference
// fields are found from `spec.schemas`; no store or plugin is built.
export const checkSpec = <State extends object, Fns extends Record<string, AnyFn>, C extends object>(spec: Spec<State, Fns, C>): void => {
  runSpec({
    state: spec.state,
    transitions: adaptCases(spec.fns, spec.cases, spec.services, true),
    schemas: spec.schemas,
    match: spec.match,
  });
};
