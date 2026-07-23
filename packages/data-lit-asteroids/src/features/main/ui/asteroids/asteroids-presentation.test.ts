// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./asteroids-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  score: 0,
  lives: 3,
  wave: 1,
  gameOver: false,
  newGame: () => { },
  ...over,
});

describe("asteroids-presentation", () => {
  it("shows the score, lives and wave", () => {
    const t = Template.from(render(props({ score: 120, lives: 2, wave: 4 })));
    expect(t.text).toContain("120");
    expect(t.text).toContain("2");
    expect(t.text).toContain("4");
  });

  it("hides the game-over overlay while playing", () => {
    const t = Template.from(render(props({ gameOver: false })));
    expect(t.text).not.toContain("Game Over");
  });

  it("shows the game-over overlay when the game is over", () => {
    const t = Template.from(render(props({ gameOver: true, score: 90 })));
    expect(t.text).toContain("Game Over");
    expect(t.text).toContain("90");
  });

  it("wires the restart button to newGame", () => {
    const newGame = () => { };
    const t = Template.from(render(props({ gameOver: true, newGame })));
    expect(t.values).toContain(newGame);
  });
});
