// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Schema } from "./index.js";

describe("Schema.FromComponents", () => {
  const componentSchemas = {
    foo: { type: "string" },
    bar: { type: "number" },
  } as const;

  it("builds an object schema with explicit required order", () => {
    expect(Schema.FromComponents(componentSchemas, ["foo", "bar"])).toEqual({
      type: "object",
      properties: componentSchemas,
      required: ["foo", "bar"],
    });
  });

  it("defaults required to component keys when omitted", () => {
    const schema = Schema.FromComponents(componentSchemas);

    expect(schema).toEqual({
      type: "object",
      properties: componentSchemas,
      required: ["foo", "bar"],
    });
  });
});

describe("Schema.FromArchetype", () => {
  const components = {
    foo: { type: "string" },
    bar: { type: "number" },
    baz: { type: "boolean" },
  } as const;

  it("picks only archetype components and preserves order", () => {
    expect(Schema.FromArchetype(components, ["baz", "foo"])).toEqual({
      type: "object",
      properties: {
        baz: { type: "boolean" },
        foo: { type: "string" },
      },
      required: ["baz", "foo"],
    });
  });

  it("does not include components outside the archetype", () => {
    const schema = Schema.FromArchetype(components, ["bar"]);

    expect(schema.properties).toEqual({ bar: { type: "number" } });
    expect(schema.required).toEqual(["bar"]);
    expect(schema.properties).not.toHaveProperty("foo");
    expect(schema.properties).not.toHaveProperty("baz");
  });
});
