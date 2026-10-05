// © 2026 Adobe. MIT License. See /LICENSE for details.
// A real-time feature's systems conform one by one and as a frame. `integrate` is
// scheduled after `accelerate`, and the frame case only holds in that order, so it
// proves the order comes from `schedule`, not from the spec. `drift` reads a service,
// so its frame case also proves each run gets fresh recording doubles. `physics`
// stands in for a system the spec can't model (e.g. wasm) and `seed` is init-only;
// both are declared unmodelled and skipped. Every system guards on `frozen`, which
// the `noOp` case checks against each of them.
import { Database } from "@adobe/data/ecs";
import { spec } from "./spec.js";
import { implementation } from "./implementation.js";
import { checkSpec } from "./check-spec.js";
import { checkFeature } from "./check-feature.js";
import type { SpecCases } from "./feature-types.js";
import type { FrameCases } from "./systems-types.js";

type State = { readonly frozen: boolean; readonly position: number; readonly velocity: number; readonly offset: number };

interface Rng {
  readonly serviceName: "rng";
  readonly next: () => number;
}

const accelerate = (state: Pick<State, "frozen" | "velocity">, { dt }: { readonly dt: number }): Pick<State, "velocity"> => ({
  velocity: state.frozen ? state.velocity : state.velocity + dt,
});
const integrate = (state: State, { dt }: { readonly dt: number }): Pick<State, "position"> => ({
  position: state.frozen ? state.position : state.position + state.velocity * dt,
});
const drift = (state: Pick<State, "frozen" | "offset">, { rng }: { readonly rng: Rng }): Pick<State, "offset"> => ({
  offset: state.frozen ? state.offset : state.offset + rng.next(),
});
const systems = { accelerate, integrate, drift };

const plugin = Database.Plugin.create({
  services: { rng: (): Rng => ({ serviceName: "rng", next: () => 0 }) },
  resources: {
    frozen: { default: false as boolean },
    position: { default: 0 as number },
    velocity: { default: 0 as number },
    offset: { default: 0 as number },
    jitter: { default: 0 as number },
    frameDelta: { default: 0 as number },
  },
  systems: {
    integrate: {
      schedule: { after: ["accelerate"] },
      create: (db) => () => {
        const r = db.store.resources;
        if (!r.frozen) r.position += r.velocity * r.frameDelta;
      },
    },
    accelerate: {
      create: (db) => () => {
        const r = db.store.resources;
        if (!r.frozen) r.velocity += r.frameDelta;
      },
    },
    drift: {
      create: (db) => () => {
        const r = db.store.resources;
        if (!r.frozen) r.offset += db.services.rng.next();
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
const driftCases: SpecCases<State, typeof drift> = {
  cases: [{ name: "adds the next random offset", before: { offset: 1 }, responses: { rng: { next: [4] } }, after: { offset: 5 } }],
};

const motion = spec({
  state: { create: (): State => ({ frozen: false, position: 0, velocity: 0, offset: 0 }) },
  fns: {},
  cases: {},
  services: { rng: (): Rng => ({ serviceName: "rng", next: () => 0 }) },
  systems: {
    fns: systems,
    cases: { accelerate: accelerateCases, integrate: integrateCases, drift: driftCases },
    noOp: [{ name: "frozen", before: { frozen: true, position: 1, velocity: 2, offset: 3 }, args: { dt: 5 } }],
  },
});

// Whole frames: accelerate first gives velocity 3, then position 0 + 3 × 2 = 6 (the
// other order gives 2).
const frame: FrameCases<State, typeof systems> = {
  cases: [
    {
      name: "accelerates, then integrates",
      before: { velocity: 1 },
      args: { dt: 2 },
      responses: { rng: { next: [5] } },
      after: { velocity: 3, position: 6, offset: 5 },
    },
  ],
};

checkSpec(motion);

checkFeature(
  implementation(motion, {
    plugin,
    projection: {
      fromState: (store: Store, state: State): void => {
        store.resources.frozen = state.frozen;
        store.resources.position = state.position;
        store.resources.velocity = state.velocity;
        store.resources.offset = state.offset;
      },
      toState: (store: Store): State => ({
        frozen: store.resources.frozen,
        position: store.resources.position,
        velocity: store.resources.velocity,
        offset: store.resources.offset,
      }),
    },
    frame: {
      args: { dt: (db, dt) => { db.store.resources.frameDelta = dt; } },
      unmodelled: { physics: "stands in for a wasm system", seed: "init-only" },
      cases: frame,
    },
  }),
);
