// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data-testing";

// Advance one animation frame: every sprite rotates by `delta * 0.1` radians.
// `delta` is the frame time step, supplied by the caller (the render loop).
// Writes only `entities`.
export const tick = (
  state: Pick<State, "entities">,
  input: { readonly delta: number },
): Pick<State, "entities"> => ({
  entities: new Map(
    [...state.entities].map(([id, sprite]): [number, Sprite] => [
      id,
      { ...sprite, rotation: sprite.rotation + input.delta * 0.1 },
    ]),
  ),
});

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Spec-owned cases, shared with the ecs `tick` transaction. Every sprite's
// rotation advances by delta * 0.1; `after` keys are `Match.ref` distinct labels.
export const cases: Conformance<typeof tick> = [
  {
    name: "advances every sprite's rotation by delta * 0.1",
    before: { entities: new Map([[1, bunny], [2, fox]]) },
    args: { delta: 10 },
    after: {
      entities: new Map([
        [Match.ref("a"), { ...bunny, rotation: 1 }],
        [Match.ref("b"), { ...fox, rotation: 2 }],
      ]),
    },
  },
  {
    name: "is a no-op on an empty scene",
    before: { entities: new Map<number, Sprite>(), filter: "blur" },
    args: { delta: 5 },
    after: { entities: new Map<number, Sprite>() },
  },
];
