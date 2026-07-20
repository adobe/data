// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Template } from "@adobe/data-lit";
import { render } from "./tictactoe-cell-presentation.js";

const props = (over: Partial<Parameters<typeof render>[0]> = {}) => ({
  cell: " ",
  isWinning: false,
  isPlayable: false,
  playMove: () => {},
  ...over,
});

describe("tictactoe-cell-presentation", () => {
  it("shows the mark of an occupied cell", () => {
    const t = Template.from(render(props({ cell: "X" })));
    expect(t.has("cell")).toBe(true);
    expect(t.text).toContain("X");
  });

  it("flags winning and playable cells via class", () => {
    const t = Template.from(render(props({ isWinning: true, isPlayable: true })));
    expect(t.has("winning")).toBe(true);
    expect(t.has("playable")).toBe(true);
  });

  it("invokes playMove when a playable cell is clicked", () => {
    let calls = 0;
    const t = Template.from(render(props({ isPlayable: true, playMove: () => { calls++; } })));
    const onClick = t.values.find((v): v is () => void => typeof v === "function");
    onClick?.();
    expect(calls).toBe(1);
  });

  it("ignores clicks on a non-playable cell", () => {
    let calls = 0;
    const t = Template.from(render(props({ isPlayable: false, playMove: () => { calls++; } })));
    t.values.find((v): v is () => void => typeof v === "function")?.();
    expect(calls).toBe(0);
  });
});
