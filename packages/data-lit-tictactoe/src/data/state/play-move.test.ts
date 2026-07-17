// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { State } from "./state.js";

const empty: State = { board: "         ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 };

describe("State.playMove", () => {
  it("places the current player's mark, alternating by move count", () => {
    const s1 = State.playMove(empty, { index: 4 });
    expect(s1.board).toBe("    X    ");
    const s2 = State.playMove(s1, { index: 0 });
    expect(s2.board).toBe("O   X    ");
  });

  it("ignores illegal moves (occupied cell)", () => {
    const s1 = State.playMove(empty, { index: 4 });
    expect(State.playMove(s1, { index: 4 })).toBe(s1);
  });
});
