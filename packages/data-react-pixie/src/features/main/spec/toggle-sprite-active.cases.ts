// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { Sprite } from "../data/entities/sprite.js";
import type { State } from "./state.js";
import type { toggleSpriteActive } from "./toggle-sprite-active.js";

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const activeFox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: true,
};

// Inert, spec-owned cases for `toggleSpriteActive`, shared with the ecs action.
// The `args` schema marks `id` as an entity reference so the ecs side resolves the
// spec-id to its seeded entity. `before`/`after` keys are plain spec-ids (the ecs
// mints its own; compared up to an id-bijection).
export const cases: Conformance.SpecCases<State, typeof toggleSpriteActive> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "toggles a sprite from inactive to active",
      before: { entities: new Map([[1, bunny], [2, activeFox]]) },
      args: { id: 1 },
      after: {
        entities: new Map([
          [1, { ...bunny, active: true }],
          [2, activeFox],
        ]),
      },
    },
    {
      name: "toggles a sprite from active to inactive",
      before: { entities: new Map([[1, bunny], [2, activeFox]]) },
      args: { id: 2 },
      after: {
        entities: new Map([
          [1, bunny],
          [2, { ...activeFox, active: false }],
        ]),
      },
    },
    {
      name: "is a no-op for an unknown id",
      before: { entities: new Map([[1, bunny], [2, activeFox]]) },
      args: { id: 99 },
      after: {
        entities: new Map([
          [1, bunny],
          [2, activeFox],
        ]),
      },
    },
  ],
};
