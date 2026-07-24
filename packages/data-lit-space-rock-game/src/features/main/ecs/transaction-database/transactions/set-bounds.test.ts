// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setBounds` has no `data/` transform to conform to — it only records the
// play-field size resource — so it gets a direct resource assertion.
import { describe, it, expect } from "vitest";
import { createStore } from "../../conformance/create-store.js";
import { setBounds } from "./set-bounds.js";

describe("setBounds", () => {
  it("writes the dispatched bounds to the resource verbatim", () => {
    const store = createStore();
    setBounds(store, [800, 600]);
    expect(store.resources.bounds).toEqual([800, 600]);
  });

  it("overwrites a previously set bounds (e.g. on canvas resize)", () => {
    const store = createStore();
    setBounds(store, [800, 600]);
    setBounds(store, [1024, 768]);
    expect(store.resources.bounds).toEqual([1024, 768]);
  });
});
