// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { createSprite } from "./create-sprite.js";

// Inert, spec-owned cases for `createSprite` — data only, no test-framework runtime
// import (the `Conformance` binding is `import type`). A sprite is appended with
// rotation defaulting to 0 and hovered/active to false; existing sprites are
// untouched. `before` is a delta over `State.create()`; `after` is the writes patch —
// map keys are plain spec-ids (the ecs mints its own; compared up to an id-bijection).
export const cases: Conformance.SpecCases<State, typeof createSprite> = {
  cases: [
    {
      name: "appends the first sprite to an empty scene",
      before: {},
      args: { position: [100, 100], kind: "bunny" },
      after: {
        entities: new Map([
          [
            1,
            {
              position: [100, 100],
              rotation: 0,
              kind: "bunny",
              hovered: false,
              active: false,
            },
          ],
        ]),
      },
    },
    {
      name: "appends a fox with the next id and an explicit rotation",
      before: {
        entities: new Map([
          [
            1,
            {
              position: [100, 100],
              rotation: 0,
              kind: "bunny",
              hovered: false,
              active: false,
            },
          ],
        ]),
        filter: "sepia",
      },
      args: { position: [300, 200], rotation: 1, kind: "fox" },
      after: {
        entities: new Map([
          [
            1,
            {
              position: [100, 100],
              rotation: 0,
              kind: "bunny",
              hovered: false,
              active: false,
            },
          ],
          [
            2,
            {
              position: [300, 200],
              rotation: 1,
              kind: "fox",
              hovered: false,
              active: false,
            },
          ],
        ]),
      },
    },
  ],
};
