// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data/testing";

// Advance one animation frame: every sprite rotates by `delta * 0.1` radians.
// `delta` is the frame time step, supplied by the caller (the render loop).
export const tick = <T extends Pick<State, "sprites">>(
  state: T,
  input: { readonly delta: number },
): T => ({
  ...state,
  sprites: state.sprites.map((sprite) => ({
    ...sprite,
    rotation: sprite.rotation + input.delta * 0.1,
  })),
});

const bunny: Sprite = {
  id: 1,
  position: [100, 100],
  rotation: 0,
  kind: "bunny",
  hovered: false,
  active: false,
};
const fox: Sprite = {
  id: 2,
  position: [300, 200],
  rotation: 1,
  kind: "fox",
  hovered: false,
  active: false,
};

// Spec-owned cases, shared with the ecs `tick` transaction. Every sprite's
// rotation advances by delta * 0.1; ids are left open (`anyNumber`).
export const cases: Conformance<typeof tick> = [
  {
    name: "advances every sprite's rotation by delta * 0.1",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { delta: 10 },
    after: {
      sprites: [
        { ...bunny, id: Match.anyNumber, rotation: 1 },
        { ...fox, id: Match.anyNumber, rotation: 2 },
      ],
      filter: "none",
    },
  },
  {
    name: "is a no-op on an empty scene",
    before: { sprites: [], filter: "blur" },
    args: { delta: 5 },
    after: { sprites: [], filter: "blur" },
  },
];
