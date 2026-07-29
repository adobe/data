// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setInput` has no `data/` transform to conform to — it only records the
// player's intent resource — so it gets a direct resource assertion.
import { describe, it, expect } from "vitest";
import { createStore } from "../../conformance/create-store.js";
import { setInput } from "./set-input.js";

describe("setInput", () => {
  it("writes the dispatched input to the resource verbatim", () => {
    const store = createStore();
    const input = { turn: 1, thrust: true, fire: false };
    setInput(store, input);
    expect(store.resources.input).toEqual(input);
  });

  it("overwrites a previously set input", () => {
    const store = createStore();
    setInput(store, { turn: 1, thrust: true, fire: true });
    setInput(store, { turn: -1, thrust: false, fire: false });
    expect(store.resources.input).toEqual({ turn: -1, thrust: false, fire: false });
  });
});
