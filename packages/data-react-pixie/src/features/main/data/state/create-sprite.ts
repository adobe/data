// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";

// Append a sprite to the scene. The spec mints the id (the map key); the value
// carries none. Returns only the field it writes (`entities`).
export const createSprite = (
  state: Pick<State, "entities">,
  input: {
    readonly position: Vec2;
    readonly rotation?: number;
    readonly kind: SpriteKind;
  },
): Pick<State, "entities"> => {
  const id = Math.max(0, ...state.entities.keys()) + 1;
  return {
    entities: new Map(state.entities).set(id, {
      position: input.position,
      rotation: input.rotation ?? 0,
      kind: input.kind,
      hovered: false,
      active: false,
    }),
  };
};

// Spec-owned cases, shared with the ecs `createSprite` transaction. A sprite is
// appended with rotation defaulting to 0 and hovered/active to false; existing
// sprites are untouched. `before` is a delta over `State.create()`; `after` is
// the writes patch — map keys are plain spec-ids (the ecs mints its own; conformance
// compares up to an id-bijection).
export const cases = Conformance.cases(createSprite,
  {
    name: "appends the first sprite to an empty scene",
    before: {},
    args: { position: [100, 100], kind: "bunny" },
    after: {
      entities: new Map([
        [
          1,
          {
            position: [100, 100],
            rotation: 0,
            kind: "bunny",
            hovered: false,
            active: false,
          },
        ],
      ]),
    },
  },
  {
    name: "appends a fox with the next id and an explicit rotation",
    before: {
      entities: new Map([
        [
          1,
          {
            position: [100, 100],
            rotation: 0,
            kind: "bunny",
            hovered: false,
            active: false,
          },
        ],
      ]),
      filter: "sepia",
    },
    args: { position: [300, 200], rotation: 1, kind: "fox" },
    after: {
      entities: new Map([
        [
          1,
          {
            position: [100, 100],
            rotation: 0,
            kind: "bunny",
            hovered: false,
            active: false,
          },
        ],
        [
          2,
          {
            position: [300, 200],
            rotation: 1,
            kind: "fox",
            hovered: false,
            active: false,
          },
        ],
      ]),
    },
  },
);
