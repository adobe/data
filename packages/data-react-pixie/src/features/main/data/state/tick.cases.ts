// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { Sprite } from "../sprite/sprite.js";
import type { State } from "./state.js";
import type { tick } from "./tick.js";

const bunny: Sprite = {
  position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false,
};
const fox: Sprite = {
  position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false,
};

// Inert, spec-owned cases for `tick`, shared with the ecs transaction. Every
// sprite's rotation advances by delta * 0.1; `after` keys are plain spec-ids
// (compared up to an id-bijection).
export const cases: Conformance.SpecCases<State, typeof tick> = {
  cases: [
    {
      name: "advances every sprite's rotation by delta * 0.1",
      before: { entities: new Map([[1, bunny], [2, fox]]) },
      args: { delta: 10 },
      after: {
        entities: new Map([
          [1, { ...bunny, rotation: 1 }],
          [2, { ...fox, rotation: 2 }],
        ]),
      },
    },
    {
      name: "is a no-op on an empty scene",
      before: { entities: new Map<number, Sprite>(), filter: "blur" },
      args: { delta: 5 },
      after: { entities: new Map<number, Sprite>() },
    },
  ],
};
