// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runSpec } from "./run-spec.js";
import { adaptCases } from "./adapt-spec.js";
import { withNoOp } from "./with-no-op.js";
import type { Spec } from "./spec.js";

type AnyFn = (...args: never[]) => unknown;

// The pure-spec suite: run every case against its spec fn, with fresh recording
// doubles built from the `services` templates + each case's `responses`. Reference
// fields are found from `spec.schemas`; no store or plugin is built. Per-system cases
// run here too; whole-frame cases need the ECS's system order, so `checkFeature` runs them.
export const checkSpec = <State extends object, Fns extends Record<string, AnyFn>, C extends object, Sys extends Record<string, AnyFn>>(
  spec: Spec<State, Fns, C, Sys>,
): void => {
  runSpec({
    state: spec.state,
    transitions: {
      ...adaptCases(spec.fns, spec.cases, spec.services, true),
      ...(spec.systems ? adaptCases(spec.systems.fns, withNoOp(spec.systems.cases, spec.systems.noOp), spec.services, true) : {}),
    },
    schemas: spec.schemas,
    match: spec.match,
  });
};
