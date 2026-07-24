// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Vec3 } from "../math/index.js";
import { Schema } from "./index.js";

describe("Schema.fromStructProperties", () => {
  it("builds a struct schema from struct-compatible fields", () => {
    const schema = Schema.fromStructProperties({
      position: Vec3.F32.schema,
      velocity: Vec3.F32.schema,
      gridIndex: Vec3.U32.schema,
    });

    expect(schema).toEqual({
      type: "object",
      properties: {
        position: Vec3.F32.schema,
        velocity: Vec3.F32.schema,
        gridIndex: Vec3.U32.schema,
      },
      required: ["position", "velocity", "gridIndex"],
    });
  });

  it("throws when a field is not struct-compatible", () => {
    expect(() =>
      Schema.fromStructProperties({
        name: { type: "string" },
      }),
    ).toThrow();
  });
});
