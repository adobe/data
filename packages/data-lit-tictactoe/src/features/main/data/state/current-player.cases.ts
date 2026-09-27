// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { currentPlayer } from "./current-player.js";

// Inert derivation cases for `currentPlayer` — `{ input, value }` pairs, the
// `Conformance` binding is `import type`. Shared with the ecs `currentPlayer`
// computed. `input` is a full `State` delta; `value` is the mark to move.
export const cases: Conformance.SpecDerivations<typeof currentPlayer> = {
  cases: [
    {
      name: "the first player moves on an empty board",
      input: {
        board: "         ",
        firstPlayer: "X",
      },
      value: "X",
    },
    {
      name: "honors a first player of O on an empty board",
      input: {
        board: "         ",
        firstPlayer: "O",
      },
      value: "O",
    },
    {
      name: "alternates to the opponent after the first move",
      input: {
        board: "    X    ",
        firstPlayer: "X",
      },
      value: "O",
    },
    {
      name: "returns to the first player after both have moved",
      input: {
        board: "XO       ",
        firstPlayer: "X",
      },
      value: "X",
    },
  ],
};
