// © 2026 Adobe. MIT License. See /LICENSE for details.
// A real-time feature's per-frame `step` conforms by driving one frame of its systems:
// the system writes a resource in place, and no action or transaction exists for it.
import { Database } from "@adobe/data/ecs";
import { spec } from "./spec.js";
import { implementation } from "./implementation.js";
import { checkFeature } from "./check-feature.js";
import type { SpecCases } from "./feature-types.js";

type State = { readonly distance: number; readonly speed: number };

const step = (state: State, { dt }: { readonly dt: number }): Pick<State, "distance"> => ({
  distance: state.distance + state.speed * dt,
});

const plugin = Database.Plugin.create({
  resources: {
    distance: { default: 0 as number },
    speed: { default: 0 as number },
    frameDelta: { default: 0 as number },
  },
  systems: {
    move: {
      create: (db) => () => {
        db.store.resources.distance += db.store.resources.speed * db.store.resources.frameDelta;
      },
    },
  },
});

type Store = Database.Plugin.ToStore<typeof plugin>;

const cases: SpecCases<State, typeof step> = {
  cases: [
    { name: "advances by speed × dt", before: { speed: 2 }, args: { dt: 3 }, after: { distance: 6 } },
    { name: "stands still at zero speed", before: { distance: 1 }, args: { dt: 5 }, after: { distance: 1 } },
  ],
};

checkFeature(
  implementation(
    spec({ state: { create: (): State => ({ distance: 0, speed: 0 }) }, fns: { step }, cases: { step: cases } }),
    {
      plugin,
      projection: {
        fromState: (store: Store, state: State): void => {
          store.resources.distance = state.distance;
          store.resources.speed = state.speed;
        },
        toState: (store: Store): State => ({ distance: store.resources.distance, speed: store.resources.speed }),
      },
      frame: {
        op: "step",
        setup: (db, { dt }) => {
          db.store.resources.frameDelta = dt;
        },
      },
    },
  ),
);
