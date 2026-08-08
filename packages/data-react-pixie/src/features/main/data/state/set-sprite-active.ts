// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";

// Set the addressed sprite's `active` flag. Writes only `sprites`.
export const setSpriteActive = (
  state: Pick<State, "sprites">,
  input: { readonly id: number; readonly active: boolean },
): Pick<State, "sprites"> => ({
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, active: input.active } : sprite,
  ),
});

const bunny: Sprite = {
  id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Spec-owned cases, shared with the ecs `setSpriteActive` transaction. `before`
// ids address the sprite (`entity(2)`); `after` ids are left open (`anyNumber`).
export const cases: Conformance<typeof setSpriteActive> = [
  {
    name: "sets active true on the addressed sprite only",
    before: { sprites: [bunny, fox] },
    args: { id: entity(2), active: true },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber },
        { ...fox, id: Match.anyNumber, active: true },
      ],
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, fox] },
    args: { id: entity(99), active: true },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber },
        { ...fox, id: Match.anyNumber },
      ],
    },
  },
];
