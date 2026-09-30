// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { runFeature } from "./run-feature.js";
import { runSystems, type SystemCase, type SystemDatabase } from "./run-systems.js";
import { adaptCases } from "./adapt-spec.js";
import type { SchemaSource } from "./refify.js";
import type { Implementation } from "./implementation.js";

type AnyFn = (...args: never[]) => unknown;

// Frame cases with recording doubles injected into their `args`, as `adaptCases` does
// for an op's cases.
const frameCasesOf = (frame: object | undefined, services: Readonly<Record<string, () => object>> | undefined): readonly SystemCase[] => {
  if (frame === undefined) return [];
  const adapted = adaptCases({ frame: () => undefined }, { frame }, services, true)["./frame"]!;
  // Runtime invariant: `adaptCases` keeps a transition envelope's `{ cases }` list.
  return (adapted["cases"] as { readonly cases: readonly SystemCase[] }).cases;
};

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
    services: impl.services,
    match: spec.match,
    ops: impl.ops,
  });
  if (spec.systems && impl.frame) {
    const baseServices = (): Record<string, object> =>
      Object.fromEntries(Object.entries(impl.services ?? {}).map(([name, create]) => [name, create()]));
    runSystems<State, StoreT>({
      // Runtime invariant: a plugin builds a database whose system surface and store
      // are the projection's (`implementation` types `plugin` and `projection` together).
      makeDb: (services) =>
        Database.toSystemDatabase(
          Database.create(impl.plugin as never, { services: { ...baseServices(), ...services } }),
        ) as unknown as SystemDatabase<StoreT>,
      fromState: impl.projection.fromState,
      toState: impl.projection.toState,
      initial: spec.state.create(),
      systems: adaptCases(spec.systems.fns, spec.systems.cases, spec.services, true),
      frameCases: () => frameCasesOf(spec.systems?.frame, spec.services),
      // Runtime invariant: `implementation` types each writer against this db and arg.
      args: impl.frame.args as never,
      unmodelled: impl.frame.unmodelled ?? {},
      match: spec.match,
    });
  }
};
