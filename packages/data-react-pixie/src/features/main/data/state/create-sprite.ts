// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Match } from "@adobe/data-testing";

const nextSpriteId = (state: Pick<State, "sprites">): number =>
  state.sprites.reduce((max, sprite) => Math.max(max, sprite.id), 0) + 1;

// Append a sprite to the scene. Returns only the field it writes (`sprites`).
export const createSprite = (
  state: Pick<State, "sprites">,
  input: {
    readonly position: Vec2;
    readonly rotation?: number;
    readonly kind: SpriteKind;
  },
): Pick<State, "sprites"> => ({
  sprites: [
    ...state.sprites,
    {
      id: nextSpriteId(state),
      position: input.position,
      rotation: input.rotation ?? 0,
      kind: input.kind,
      hovered: false,
      active: false,
    },
  ],
});

// Spec-owned cases, shared with the ecs `createSprite` transaction. A sprite is
// appended (minted id left open as `anyNumber` — the ecs assigns its own) with
// rotation defaulting to 0 and hovered/active to false; existing sprites are
// untouched. `before` is a delta over `State.create()`; `after` is the writes patch.
export const cases: Conformance<typeof createSprite> = [
  {
    name: "appends the first sprite to an empty scene",
    before: {},
    args: { position: [100, 100], kind: "bunny" },
    after: {
      sprites: [
        {
          id: Match.anyNumber,
          position: [100, 100],
          rotation: 0,
          kind: "bunny",
          hovered: false,
          active: false,
        },
      ],
    },
  },
  {
    name: "appends a fox with the next id and an explicit rotation",
    before: {
      sprites: [
        {
          id: 1,
          position: [100, 100],
          rotation: 0,
          kind: "bunny",
          hovered: false,
          active: false,
        },
      ],
      filter: "sepia",
    },
    args: { position: [300, 200], rotation: 1, kind: "fox" },
    after: {
      sprites: [
        {
          id: Match.anyNumber,
          position: [100, 100],
          rotation: 0,
          kind: "bunny",
          hovered: false,
          active: false,
        },
        {
          id: Match.anyNumber,
          position: [300, 200],
          rotation: 1,
          kind: "fox",
          hovered: false,
          active: false,
        },
      ],
    },
  },
];
