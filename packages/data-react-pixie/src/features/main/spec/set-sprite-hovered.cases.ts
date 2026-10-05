// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Conformance } from "@adobe/data-testing";
import type { Sprite } from "../data/entities/sprite.js";
import type { State } from "./state.js";
import type { setSpriteHovered } from "./set-sprite-hovered.js";

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Inert, spec-owned cases for `setSpriteHovered`, shared with the ecs action.
// The `args` schema marks `id` as an entity reference so the ecs side resolves the
// spec-id to its seeded entity. `before`/`after` keys are plain spec-ids (the ecs
// mints its own; compared up to an id-bijection).
export const cases: Conformance.SpecCases<State, typeof setSpriteHovered> = {
  args: { type: "object", properties: { id: Entity.schema } },
  cases: [
    {
      name: "sets hovered true on the addressed sprite only",
      before: { entities: new Map([[1, bunny], [2, fox]]) },
      args: { id: 1, hovered: true },
      after: {
        entities: new Map([
          [1, { ...bunny, hovered: true }],
          [2, fox],
        ]),
      },
    },
    {
      name: "is a no-op for an unknown id",
      before: { entities: new Map([[1, bunny], [2, fox]]) },
      args: { id: 99, hovered: true },
      after: {
        entities: new Map([
          [1, bunny],
          [2, fox],
        ]),
      },
    },
  ],
};
