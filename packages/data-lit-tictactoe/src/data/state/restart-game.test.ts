// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

describe("State.restartGame", () => {
  it("tallies the winner, alternates first player, and clears the board", () => {
    const won: State = { board: "XXX      ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 };
    expect(State.restartGame(won)).toEqual({
      board: "         ",
      firstPlayer: "O",
      xWins: 1,
      oWins: 0,
      draws: 0,
    });
  });

  it("counts a draw", () => {
    const draw: State = { board: "XOXXOOOXX", firstPlayer: "O", xWins: 2, oWins: 1, draws: 0 };
    const next = State.restartGame(draw);
    expect(next.draws).toBe(1);
    expect(next.firstPlayer).toBe("X");
  });
});
