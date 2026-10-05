// © 2026 Adobe. MIT License. See /LICENSE for details.
// Compile-time guards of the systems manifest: every ECS system is modelled xor
// unmodelled, and every frame data arg has a writer.
import { Database } from "@adobe/data/ecs";
import { spec } from "./spec.js";
import { implementation } from "./implementation.js";
import type { SpecCases } from "./feature-types.js";

type State = { readonly velocity: number };
const accelerate = (state: State, { dt }: { readonly dt: number }): State => ({ velocity: state.velocity + dt });
declare const accelerateCases: SpecCases<State, typeof accelerate>;

const plugin = Database.Plugin.create({
  resources: { velocity: { default: 0 as number }, frameDelta: { default: 0 as number } },
  systems: {
    accelerate: { create: (db) => () => { db.store.resources.velocity += db.store.resources.frameDelta; } },
    physics: { create: () => () => {} },
  },
});
type Store = Database.Plugin.ToStore<typeof plugin>;
const projection = {
  fromState: (store: Store, state: State): void => { store.resources.velocity = state.velocity; },
  toState: (store: Store): State => ({ velocity: store.resources.velocity }),
};
const motion = spec({ state: { create: (): State => ({ velocity: 0 }) }, fns: {}, cases: {}, systems: { fns: { accelerate }, cases: { accelerate: accelerateCases } } });
const dt = (db: Database.Plugin.ToSystemDatabase<typeof plugin>, value: number) => { db.store.resources.frameDelta = value; };

// POSITIVE — `accelerate` modelled, `physics` unmodelled, `dt` written.
export const ok = implementation(motion, { plugin, projection, frame: { args: { dt }, unmodelled: { physics: "wasm" } } });

// @ts-expect-error — `physics` is neither modelled nor declared unmodelled
export const missing = implementation(motion, { plugin, projection, frame: { args: { dt } } });

// @ts-expect-error — `gravity` is not a system of this plugin
export const unknown = implementation(motion, { plugin, projection, frame: { args: { dt }, unmodelled: { physics: "wasm", gravity: "x" } } });

// @ts-expect-error — `accelerate` is modelled, so it can't also be unmodelled
export const both = implementation(motion, { plugin, projection, frame: { args: { dt }, unmodelled: { physics: "wasm", accelerate: "x" } } });

// @ts-expect-error — the frame arg `dt` has no writer
export const noWriter = implementation(motion, { plugin, projection, frame: { args: {}, unmodelled: { physics: "wasm" } } });

// @ts-expect-error — a spec with systems requires `frame`
export const noFrame = implementation(motion, { plugin, projection });
