// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./tictactoe-hud-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  status: "in_progress" as const,
  winner: null,
  currentPlayer: "X" as const,
  xWins: 0,
  oWins: 0,
  draws: 0,
  restartGame: () => {},
  ...over,
});

describe("tictactoe-hud-presentation", () => {
  it("shows whose turn it is while in progress", () => {
    const t = Template.from(render(props({ currentPlayer: "O" })));
    expect(t.text).toContain("O's turn");
  });

  it("announces the winner", () => {
    const t = Template.from(render(props({ status: "won", winner: "X" })));
    expect(t.text).toContain("X wins!");
  });

  it("announces a draw", () => {
    const t = Template.from(render(props({ status: "draw" })));
    expect(t.text).toContain("Draw!");
  });

  it("renders the score tallies", () => {
    const t = Template.from(render(props({ xWins: 2, oWins: 3, draws: 4 })));
    expect(t.text).toContain("2");
    expect(t.text).toContain("3");
    expect(t.text).toContain("4");
  });

  it("wires the restart button to restartGame", () => {
    const restartGame = () => {};
    const t = Template.from(render(props({ restartGame })));
    expect(t.values).toContain(restartGame);
  });
});
