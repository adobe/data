// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Database } from "@adobe/data/ecs";
import type { UnionToIntersection } from "@adobe/data/types";
import type { ArgsOf, DataArgKeys, SpecCases } from "./feature-types.js";

type AnyFn = (...args: never[]) => unknown;

// The args one frame supplies: the intersection of every system function's args
// (`{ dt } & { input } & { random }`), so a frame case provides them all.
export type FrameArgs<Sys> = UnionToIntersection<{ [K in keyof Sys]: ArgsOf<Sys[K]> }[keyof Sys]>;

// A whole-frame case: seed `before`, run every modelled system once in schedule
// order, expect `after`.
export type FrameCases<State, Sys> = SpecCases<State, (state: State, args: FrameArgs<Sys>) => Partial<State>>;

// The per-system cases: exactly one case module per system function.
export type SystemCases<State, Sys> = { readonly [K in keyof Sys]: SpecCases<State, Sys[K] & AnyFn> };

// The spec's systems group: pure functions named after the ECS systems they specify.
export type SpecSystems<State, Sys> = {
  readonly fns: Sys;
  readonly cases: SystemCases<State, Sys>;
  readonly frame?: FrameCases<State, Sys>;
};

// The names of a plugin's systems, less the scheduler's own driver system.
export type SystemKeys<PL extends Database.Plugin> = Exclude<
  Extract<keyof Database.Plugin.ToSystemDatabase<PL>["system"]["functions"], string>,
  "schedulerSystem"
>;

// One writer per data arg of the frame: how a case's arg reaches the store
// (`dt: (db, dt) => { db.store.resources.frameDelta = dt; }`). Services arrive as
// recording doubles, so they need no writer.
export type FrameArgWriters<PL extends Database.Plugin, Sys> = {
  readonly [K in DataArgKeys<FrameArgs<Sys>>]-?: (
    db: Database.Plugin.ToSystemDatabase<PL>,
    value: FrameArgs<Sys>[K],
  ) => void;
};

// Every ECS system is either modelled (a spec function of the same name) or declared
// unmodelled, never both, and the spec names no system the ECS lacks.
export type SystemsExact<Modelled, Unmodelled, All> = [Exclude<All, Modelled | Unmodelled>] extends [never]
  ? [Exclude<Modelled | Unmodelled, All>] extends [never]
    ? [Extract<Modelled, Unmodelled>] extends [never]
      ? unknown
      : { readonly __systemsError: "a system is both modelled and unmodelled"; readonly both: Extract<Modelled, Unmodelled> }
    : { readonly __systemsError: "names a system the ECS does not have"; readonly unknown: Exclude<Modelled | Unmodelled, All> }
  : { readonly __systemsError: "a system is neither modelled nor unmodelled"; readonly missing: Exclude<All, Modelled | Unmodelled> };
