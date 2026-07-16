// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { toggleDisplayCompleted } from "./toggle-display-completed.js";
import type { DataModel } from "./data-model.js";

const displayOff: Pick<DataModel, "displayCompleted"> = { displayCompleted: false };

describe("toggleDisplayCompleted", () => {
  it("flips displayCompleted from false to true", () => {
    expect(toggleDisplayCompleted(displayOff).displayCompleted).toBe(true);
  });

  it("flips displayCompleted from true to false", () => {
    const displayOn: Pick<DataModel, "displayCompleted"> = { displayCompleted: true };
    expect(toggleDisplayCompleted(displayOn).displayCompleted).toBe(false);
  });
});
