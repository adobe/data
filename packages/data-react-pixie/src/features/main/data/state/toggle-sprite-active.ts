// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import { entity, type Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";

export const toggleSpriteActive = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly id: number },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) =>
    sprite.id === input.id ? { ...sprite, active: !sprite.active } : sprite,
  ),
});

const bunny: Sprite = {
  id: 1,
  position: [100, 100],
  rotation: 0,
  kind: "bunny",
  hovered: false,
  active: false,
};
const activeFox: Sprite = {
  id: 2,
  position: [300, 200],
  rotation: 1,
  kind: "fox",
  hovered: false,
  active: true,
};

// Spec-owned cases, shared with the ecs `toggleSpriteActive` transaction. Flips
// the addressed sprite's `active` flag; a no-op for an unknown id. `before` ids
// address the sprite; `after` ids are left open (`anyNumber`).
export const cases: Conformance<typeof toggleSpriteActive> = [
  {
    name: "toggles a sprite from inactive to active",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: entity(1) },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber, active: true },
        { ...activeFox, id: Match.anyNumber },
      ],
      filter: "none",
    },
  },
  {
    name: "toggles a sprite from active to inactive",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: entity(2) },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber },
        { ...activeFox, id: Match.anyNumber, active: false },
      ],
      filter: "none",
    },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: entity(99) },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber },
        { ...activeFox, id: Match.anyNumber },
      ],
      filter: "none",
    },
  },
];
