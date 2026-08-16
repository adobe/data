// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data-testing";

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
// keys are plain spec-ids the `args` address via `entity()`; `after` keys are
// `Match.ref` distinct labels (the ecs mints its own ids).
export const cases: Conformance<typeof toggleSpriteActive> = [
  {
    name: "toggles a sprite from inactive to active",
    before: { entities: new Map([[1, bunny], [2, activeFox]]) },
    args: { id: entity(1) },
    after: {
      entities: new Map([
        [Match.ref("a"), { ...bunny, active: true }],
        [Match.ref("b"), activeFox],
      ]),
    },
  },
  {
    name: "toggles a sprite from active to inactive",
    before: { entities: new Map([[1, bunny], [2, activeFox]]) },
    args: { id: entity(2) },
    after: {
      entities: new Map([
        [Match.ref("a"), bunny],
        [Match.ref("b"), { ...activeFox, active: false }],
      ]),
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { entities: new Map([[1, bunny], [2, activeFox]]) },
    args: { id: entity(99) },
    after: {
      entities: new Map([
        [Match.ref("a"), bunny],
        [Match.ref("b"), activeFox],
      ]),
    },
  },
];
