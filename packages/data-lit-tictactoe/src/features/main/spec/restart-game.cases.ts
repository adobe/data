// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { restartGame } from "./restart-game.js";
import { marksOf } from "./marks-of.js";

// Every restart clears the board and hands the first move to the other player; the
// scoreboard is bumped only for a finished game's outcome.
export const cases: Conformance.SpecCases<State, typeof restartGame> = {
  cases: [
    {
      name: "tallies an X win",
      before: { marks: marksOf("XXXOO    ") },
      after: { marks: new Map(), firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
    },
    {
      name: "tallies an O win",
      before: { marks: marksOf("OOOXX    "), firstPlayer: "O", xWins: 1, oWins: 2 },
      after: { marks: new Map(), firstPlayer: "X", xWins: 1, oWins: 3, draws: 0 },
    },
    {
      name: "tallies a draw (full board, no line)",
      before: { marks: marksOf("XOXXOOOXX"), firstPlayer: "O", xWins: 2, oWins: 1 },
      after: { marks: new Map(), firstPlayer: "X", xWins: 2, oWins: 1, draws: 1 },
    },
    {
      name: "restarts an unfinished game without touching any counter",
      before: { marks: marksOf("X O      "), xWins: 1, oWins: 1, draws: 1 },
      after: { marks: new Map(), firstPlayer: "O", xWins: 1, oWins: 1, draws: 1 },
    },
  ],
};
