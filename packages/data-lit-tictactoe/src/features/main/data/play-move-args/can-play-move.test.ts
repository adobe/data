// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { canPlayMove } from "./can-play-move.js";

describe("canPlayMove", () => {
  it("allows a move into a blank cell of an in-progress game", () => {
    expect(canPlayMove({ board: "         ", index: 4 })).toEqual({ ok: true });
  });

  it("rejects a non-integer, negative, or too-large index", () => {
    expect(canPlayMove({ board: "         ", index: 1.5 })).toEqual({
      ok: false,
      reason: "index_out_of_bounds",
    });
    expect(canPlayMove({ board: "         ", index: -1 })).toEqual({
      ok: false,
      reason: "index_out_of_bounds",
    });
    expect(canPlayMove({ board: "         ", index: 9 })).toEqual({
      ok: false,
      reason: "index_out_of_bounds",
    });
  });

  it("rejects a move once the game is over", () => {
    expect(canPlayMove({ board: "XXXOO    ", index: 5 })).toEqual({
      ok: false,
      reason: "game_over",
    });
  });

  it("rejects a move into an occupied cell", () => {
    expect(canPlayMove({ board: "X        ", index: 0 })).toEqual({
      ok: false,
      reason: "cell_occupied",
    });
  });
});
