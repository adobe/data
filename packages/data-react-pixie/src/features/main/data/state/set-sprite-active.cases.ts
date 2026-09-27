// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import type { setSpriteActive } from "./set-sprite-active.js";

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Inert, spec-owned cases for `setSpriteActive`, shared with the ecs transaction.
// The `args` schema marks `id` as an entity reference so the ecs side resolves the
// spec-id to its seeded entity. `before`/`after` keys are plain spec-ids (the ecs
// mints its own; compared up to an id-bijection).
export const cases: Conformance.SpecCases<State, typeof setSpriteActive> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "sets active true on the addressed sprite only",
      before: { entities: new Map([[1, bunny], [2, fox]]) },
      args: { id: 2, active: true },
      after: {
        entities: new Map([
          [1, bunny],
          [2, { ...fox, active: true }],
        ]),
      },
    },
    {
      name: "is a no-op for an unknown id",
      before: { entities: new Map([[1, bunny], [2, fox]]) },
      args: { id: 99, active: true },
      after: {
        entities: new Map([
          [1, bunny],
          [2, fox],
        ]),
      },
    },
  ],
};
