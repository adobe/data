// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { currentPlayer } from "./current-player.js";
import { marksOf } from "./marks-of.js";

export const cases: Conformance.SpecDerivations<typeof currentPlayer> = {
  cases: [
    {
      name: "the first player moves on an empty board",
      input: { marks: new Map(), firstPlayer: "X" },
      value: "X",
    },
    {
      name: "honors a first player of O on an empty board",
      input: { marks: new Map(), firstPlayer: "O" },
      value: "O",
    },
    {
      name: "alternates to the opponent after the first move",
      input: { marks: marksOf("    X    "), firstPlayer: "X" },
      value: "O",
    },
    {
      name: "returns to the first player after both have moved",
      input: { marks: marksOf("XO       "), firstPlayer: "X" },
      value: "X",
    },
  ],
};
