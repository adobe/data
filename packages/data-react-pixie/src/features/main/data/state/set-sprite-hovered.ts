// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";

// Set the addressed sprite's `hovered` flag. Writes only `sprites`.
export const setSpriteHovered = (
  state: Pick<State, "sprites">,
  input: { readonly id: number; readonly hovered: boolean },
): Pick<State, "sprites"> => ({
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, hovered: input.hovered } : sprite,
  ),
});

const bunny: Sprite = {
  id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Spec-owned cases, shared with the ecs `setSpriteHovered` transaction. `before`
// ids address the sprite (`entity(1)`); `after` ids are left open (`anyNumber`).
export const cases: Conformance<typeof setSpriteHovered> = [
  {
    name: "sets hovered true on the addressed sprite only",
    before: { sprites: [bunny, fox] },
    args: { id: entity(1), hovered: true },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber, hovered: true },
        { ...fox, id: Match.anyNumber },
      ],
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, fox] },
    args: { id: entity(99), hovered: true },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber },
        { ...fox, id: Match.anyNumber },
      ],
    },
  },
];
