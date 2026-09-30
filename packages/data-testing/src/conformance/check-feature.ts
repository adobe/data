// © 2026 Adobe. MIT License. See /LICENSE for details.
import { runFeature } from "./run-feature.js";
import { adaptCases } from "./adapt-spec.js";
import type { SchemaSource } from "./refify.js";
import type { Implementation } from "./implementation.js";

type AnyFn = (...args: never[]) => unknown;

// The ecs conformance suite: the spec's cases drive the implementation's actions and
// computeds (fresh doubles again, so the pure and ecs runs never share FIFO state).
// A spec op with no same-named implementation is a named failure.
export const checkFeature = <State extends object, Fns extends Record<string, AnyFn>, StoreT extends SchemaSource>(
  impl: Implementation<State, Fns, StoreT>,
): void => {
  const { spec } = impl;
  runFeature<State, StoreT, { store: StoreT }>({
    state: spec.state,
    transitions: adaptCases(spec.fns, spec.cases, spec.services, true),
    plugin: impl.plugin,
    computedPlugin: impl.computedPlugin,
    projection: impl.projection,
    hydrate: impl.hydrate,
    transactionOps: impl.transactionOps,
    services: impl.services,
    match: spec.match,
    ops: impl.ops,
  });
};
