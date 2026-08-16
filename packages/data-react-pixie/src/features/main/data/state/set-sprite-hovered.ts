// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";

// Set the addressed sprite's `hovered` flag. Writes only `entities`.
export const setSpriteHovered = (
  state: Pick<State, "entities">,
  input: { readonly id: number; readonly hovered: boolean },
): Pick<State, "entities"> => {
  const sprite = state.entities.get(input.id);
  if (sprite === undefined) return { entities: state.entities };
  return {
    entities: new Map(state.entities).set(input.id, {
      ...sprite,
      hovered: input.hovered,
    }),
  };
};

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Spec-owned cases, shared with the ecs `setSpriteHovered` transaction. `before`
// keys are plain spec-ids the `args` address via `entity(1)`; `after` keys are
// plain spec-ids (the ecs mints its own; compared up to an id-bijection).
export const cases: Conformance<typeof setSpriteHovered> = [
  {
    name: "sets hovered true on the addressed sprite only",
    before: { entities: new Map([[1, bunny], [2, fox]]) },
    args: { id: entity(1), hovered: true },
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
    args: { id: entity(99), hovered: true },
    after: {
      entities: new Map([
        [1, bunny],
        [2, fox],
      ]),
    },
  },
];
