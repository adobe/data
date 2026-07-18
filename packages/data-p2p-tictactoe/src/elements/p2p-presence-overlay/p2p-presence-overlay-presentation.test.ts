// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import { Template } from "@adobe/data-lit";
import { render } from "./p2p-presence-overlay-presentation.js";

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

describe("p2p-presence-overlay-presentation", () => {
  it("always renders the slot and overlay container", () => {
    const t = Template.from(render({ cursors: undefined, localMark: "X" }));
    expect(t.has("<slot")).toBe(true);
    expect(t.has("overlay")).toBe(true);
  });

  it("renders a cursor for a remote peer but not the local mark", () => {
    const t = Template.from(render({ cursors: { X: at(0.1, 0.1), O: at(0.5, 0.5) }, localMark: "X" }));
    expect(t.has("cursor")).toBe(true);
    expect(t.text).toContain("O");
  });

  it("shows no cursor when the only known cursor is the local mark", () => {
    const t = Template.from(render({ cursors: { X: at(0.1, 0.1) }, localMark: "X" }));
    expect(t.has("cursor")).toBe(false);
  });
});
