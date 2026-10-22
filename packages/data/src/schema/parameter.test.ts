// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Parameter } from "./index.js";

describe("Parameter.schemaOf", () => {
  it("unwraps a named Parameter", () => {
    const schema = { type: "number" } as const;
    expect(Parameter.schemaOf({ name: "x", schema })).toBe(schema);
  });

  it("returns a deprecated bare Schema as is", () => {
    const schema = { type: "string" } as const;
    expect(Parameter.schemaOf(schema)).toBe(schema);
  });
});
