// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "@adobe/data/ecs";
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";

// Flip the addressed sprite's `active` flag. Writes only `entities`.
export const toggleSpriteActive = (
  state: Pick<State, "entities">,
  input: { readonly id: number },
): Pick<State, "entities"> => {
  const sprite = state.entities.get(input.id);
  if (sprite === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(input.id, {
      ...sprite,
      active: !sprite.active,
    }),
  };
};

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const activeFox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: true,
};

// Spec-owned cases, shared with the ecs `toggleSpriteActive` transaction. `before`
// keys are plain spec-ids the `args` address by id (the `args` schema marks `id` as a reference); `after` keys are
// plain spec-ids (the ecs mints its own; compared up to an id-bijection).
export const cases = Conformance.cases(toggleSpriteActive, { args: { type: "object", properties: { id: Entity.schema }, required: ["id"] } },
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
);
