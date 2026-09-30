// © 2026 Adobe. MIT License. See /LICENSE for details.
// A real-time feature's systems conform one by one and as a frame. `integrate` is
// scheduled after `accelerate`, and the frame case only holds in that order, so it
// proves the order comes from `schedule`, not from the spec. `physics` stands in for a
// system the spec can't model (e.g. wasm) and `seed` is init-only; both are declared
// unmodelled and skipped.
import { Database } from "@adobe/data/ecs";
import { spec } from "./spec.js";
import { implementation } from "./implementation.js";
import { checkSpec } from "./check-spec.js";
import { checkFeature } from "./check-feature.js";
import type { SpecCases } from "./feature-types.js";
import type { FrameCases } from "./systems-types.js";

type State = { readonly position: number; readonly velocity: number };

const accelerate = (state: Pick<State, "velocity">, { dt }: { readonly dt: number }): Pick<State, "velocity"> => ({
  velocity: state.velocity + dt,
});
const integrate = (state: State, { dt }: { readonly dt: number }): Pick<State, "position"> => ({
  position: state.position + state.velocity * dt,
});
const systems = { accelerate, integrate };

const plugin = Database.Plugin.create({
  resources: {
    position: { default: 0 as number },
    velocity: { default: 0 as number },
    jitter: { default: 0 as number },
    frameDelta: { default: 0 as number },
  },
  systems: {
    integrate: {
      schedule: { after: ["accelerate"] },
      create: (db) => () => {
        db.store.resources.position += db.store.resources.velocity * db.store.resources.frameDelta;
      },
    },
    accelerate: {
      create: (db) => () => {
        db.store.resources.velocity += db.store.resources.frameDelta;
      },
    },
    physics: {
      create: (db) => () => {
        db.store.resources.jitter += 1;
      },
    },
    seed: {
      create: (db) => {
        db.store.resources.jitter = 0;
      },
    },
  },
});

type Store = Database.Plugin.ToStore<typeof plugin>;

const accelerateCases: SpecCases<State, typeof accelerate> = {
  cases: [{ name: "adds dt to velocity", before: { velocity: 1 }, args: { dt: 2 }, after: { velocity: 3 } }],
};
const integrateCases: SpecCases<State, typeof integrate> = {
  cases: [{ name: "moves by velocity × dt", before: { position: 1, velocity: 2 }, args: { dt: 3 }, after: { position: 7 } }],
};
const frame: FrameCases<State, typeof systems> = {
  cases: [
    // accelerate first: velocity 1 → 3, then position 0 + 3 × 2 = 6 (the other order gives 2).
    { name: "accelerates, then integrates", before: { velocity: 1 }, args: { dt: 2 }, after: { velocity: 3, position: 6 } },
  ],
};

const motion = spec({
  state: { create: (): State => ({ position: 0, velocity: 0 }) },
  fns: {},
  cases: {},
  systems: { fns: systems, cases: { accelerate: accelerateCases, integrate: integrateCases }, frame },
});

checkSpec(motion);

checkFeature(
  implementation(motion, {
    plugin,
    projection: {
      fromState: (store: Store, state: State): void => {
        store.resources.position = state.position;
        store.resources.velocity = state.velocity;
      },
      toState: (store: Store): State => ({ position: store.resources.position, velocity: store.resources.velocity }),
    },
    frame: {
      args: { dt: (db, dt) => { db.store.resources.frameDelta = dt; } },
      unmodelled: { physics: "stands in for a wasm system", seed: "init-only" },
    },
  }),
);
