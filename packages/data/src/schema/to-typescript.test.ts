// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Schema } from "./index.js";

describe("Schema.toTypeScript", () => {
  describe("primitives", () => {
    it("maps number/integer to number", () => {
      expect(Schema.toTypeScript({ type: "number" }, "N")).toBe("type N = number;");
      expect(Schema.toTypeScript({ type: "integer" }, "N")).toBe("type N = number;");
    });

    it("maps string, boolean, null and blob", () => {
      expect(Schema.toTypeScript({ type: "string" }, "S")).toBe("type S = string;");
      expect(Schema.toTypeScript({ type: "boolean" }, "B")).toBe("type B = boolean;");
      expect(Schema.toTypeScript({ type: "null" }, "Nul")).toBe("type Nul = null;");
      expect(Schema.toTypeScript({ type: "blob" }, "Bl")).toBe("type Bl = Blob;");
    });
  });

  describe("const, enum, default", () => {
    it("renders const literals", () => {
      expect(Schema.toTypeScript({ const: 42 }, "C")).toBe("type C = 42;");
      expect(Schema.toTypeScript({ const: "x" }, "C")).toBe('type C = "x";');
    });

    it("renders enum as a union", () => {
      expect(Schema.toTypeScript({ enum: [1, 2, 3] }, "E")).toBe("type E = 1 | 2 | 3;");
      expect(Schema.toTypeScript({ enum: ["a", "b"] }, "E")).toBe('type E = "a" | "b";');
    });

    it("renders a typeless default as its literal", () => {
      expect(Schema.toTypeScript({ default: 7 }, "D")).toBe("type D = 7;");
    });
  });

  describe("objects", () => {
    it("emits an interface with readonly members and optional keys", () => {
      const schema = {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "string" } },
        required: ["a"],
        additionalProperties: false,
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Obj")).toBe(
        ["interface Obj {", "  readonly a: number;", "  readonly b?: string;", "}"].join("\n"),
      );
    });

    it("drops readonly when the object node is mutable", () => {
      const schema = {
        type: "object",
        mutable: true,
        properties: { a: { type: "number" } },
        required: ["a"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Obj")).toBe(
        ["interface Obj {", "  a: number;", "}"].join("\n"),
      );
    });

    it("emits an index signature for schema additionalProperties", () => {
      const schema = {
        type: "object",
        additionalProperties: { type: "number" },
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Dict")).toBe(
        ["interface Dict {", "  readonly [key: string]: number;", "}"].join("\n"),
      );
    });

    it("emits [key: string]: any for additionalProperties true", () => {
      const schema = { type: "object", additionalProperties: true } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Any")).toBe(
        ["interface Any {", "  readonly [key: string]: any;", "}"].join("\n"),
      );
    });

    it("emits {} for an empty object", () => {
      expect(Schema.toTypeScript({ type: "object" }, "Empty")).toBe("interface Empty {}");
    });

    it("quotes non-identifier property keys", () => {
      const schema = {
        type: "object",
        properties: { "with-dash": { type: "number" } },
        required: ["with-dash"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Q")).toBe(
        ["interface Q {", '  readonly "with-dash": number;', "}"].join("\n"),
      );
    });

    it("inlines nested objects with increasing indentation", () => {
      const schema = {
        type: "object",
        properties: {
          inner: {
            type: "object",
            properties: { x: { type: "number" } },
            required: ["x"],
          },
        },
        required: ["inner"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Outer")).toBe(
        [
          "interface Outer {",
          "  readonly inner: {",
          "    readonly x: number;",
          "  };",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("arrays and tuples", () => {
    it("renders a readonly array", () => {
      expect(Schema.toTypeScript({ type: "array", items: { type: "string" } }, "A")).toBe(
        "type A = readonly string[];",
      );
    });

    it("renders a fixed-length tuple when minItems === maxItems", () => {
      const schema = {
        type: "array",
        items: { type: "number" },
        minItems: 3,
        maxItems: 3,
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Vec3")).toBe("type Vec3 = readonly [number, number, number];");
    });

    it("drops readonly on a mutable array", () => {
      const schema = { type: "array", mutable: true, items: { type: "number" } } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "A")).toBe("type A = number[];");
    });

    it("parenthesizes a union element before the array suffix", () => {
      const schema = { type: "array", items: { enum: [1, 2] } } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "A")).toBe("type A = readonly (1 | 2)[];");
    });

    it("renders a bare any[] when items are absent", () => {
      expect(Schema.toTypeScript({ type: "array" }, "A")).toBe("type A = readonly any[];");
    });
  });

  describe("combinators", () => {
    it("renders oneOf as a union", () => {
      const schema = { oneOf: [{ type: "string" }, { type: "number" }] } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "U")).toBe("type U = string | number;");
    });

    it("renders allOf as an intersection", () => {
      const schema = {
        allOf: [
          { type: "object", properties: { a: { type: "number" } }, required: ["a"] },
          { type: "object", properties: { b: { type: "string" } }, required: ["b"] },
        ],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "I")).toBe(
        [
          "type I = {",
          "  readonly a: number;",
          "} & {",
          "  readonly b: string;",
          "};",
        ].join("\n"),
      );
    });

    it("renders a Nullable schema as a union with null", () => {
      expect(Schema.toTypeScript(Schema.Nullable({ type: "string" }), "MaybeStr")).toBe(
        "type MaybeStr = string | null;",
      );
    });
  });

  describe("service constructors", () => {
    it("wraps observe/promise/generator value types", () => {
      expect(Schema.toTypeScript({ type: "observe", value: { type: "number" } }, "O")).toBe(
        "type O = Observe<number>;",
      );
      expect(Schema.toTypeScript({ type: "promise", value: { type: "string" } }, "P")).toBe(
        "type P = Promise<string>;",
      );
      expect(Schema.toTypeScript({ type: "generator", value: { type: "boolean" } }, "G")).toBe(
        "type G = AsyncGenerator<boolean>;",
      );
    });

    it("defaults an absent wrapped value to any", () => {
      expect(Schema.toTypeScript({ type: "observe" }, "O")).toBe("type O = Observe<any>;");
    });

    it("renders a function signature with named parameters", () => {
      const schema = {
        type: "function",
        signature: {
          parameters: [
            { name: "a", schema: { type: "number" } },
            { name: "b", schema: { type: "string" } },
          ],
          returns: { type: "boolean" },
        },
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "F")).toBe("type F = (a: number, b: string) => boolean;");
    });

    it("renders a parameterless function as () => void", () => {
      expect(Schema.toTypeScript({ type: "function" }, "F")).toBe("type F = () => void;");
    });

    it("renders an action returning a promise inside a service interface", () => {
      const schema = {
        type: "object",
        properties: {
          run: {
            type: "function",
            signature: {
              parameters: [
                { name: "input", schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
              ],
              returns: { type: "promise", value: { type: "null" } },
            },
          },
          status: { type: "observe", value: { enum: ["idle", "busy"] } },
        },
        required: ["run", "status"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Service")).toBe(
        [
          "interface Service {",
          "  readonly run: (input: {",
          "    readonly id: string;",
          "  }) => Promise<null>;",
          '  readonly status: Observe<"idle" | "busy">;',
          "}",
        ].join("\n"),
      );
    });
  });

  describe("recursion", () => {
    it("descends through several levels of nested objects", () => {
      const schema = {
        type: "object",
        properties: {
          a: {
            type: "object",
            properties: {
              b: {
                type: "object",
                properties: { c: { type: "number" } },
                required: ["c"],
              },
            },
            required: ["b"],
          },
        },
        required: ["a"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Deep")).toBe(
        [
          "interface Deep {",
          "  readonly a: {",
          "    readonly b: {",
          "      readonly c: number;",
          "    };",
          "  };",
          "}",
        ].join("\n"),
      );
    });

    it("recurses into array items and function return types", () => {
      const schema = {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
          make: {
            type: "function",
            signature: { returns: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } },
          },
        },
        required: ["items", "make"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Bag")).toBe(
        [
          "interface Bag {",
          "  readonly items: readonly {",
          "    readonly id: string;",
          "  }[];",
          "  readonly make: () => {",
          "    readonly ok: boolean;",
          "  };",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("shared shape deduplication", () => {
    it("hoists a repeated shape and names it from the first property key", () => {
      const point = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } as const;
      const schema = {
        type: "object",
        properties: { from: point, to: point, label: { type: "string" } },
        required: ["from", "to"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Line")).toBe(
        [
          "interface From {",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
          "",
          "interface Line {",
          "  readonly from: From;",
          "  readonly to: From;",
          "  readonly label?: string;",
          "}",
        ].join("\n"),
      );
    });

    it("uses the shape title as the common semantic name", () => {
      const point = {
        title: "Point",
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
      } as const;
      const schema = {
        type: "object",
        properties: { from: point, to: point },
        required: ["from", "to"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Line")).toBe(
        [
          "interface Point {",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
          "",
          "interface Line {",
          "  readonly from: Point;",
          "  readonly to: Point;",
          "}",
        ].join("\n"),
      );
    });

    it("inlines a shape used only once alongside a hoisted repeated shape", () => {
      const point = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } as const;
      const schema = {
        type: "object",
        properties: {
          from: point,
          to: point,
          meta: { type: "object", properties: { created: { type: "number" } }, required: ["created"] },
        },
        required: ["from", "to", "meta"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Line")).toBe(
        [
          "interface From {",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
          "",
          "interface Line {",
          "  readonly from: From;",
          "  readonly to: From;",
          "  readonly meta: {",
          "    readonly created: number;",
          "  };",
          "}",
        ].join("\n"),
      );
    });

    it("does not merge distinct shapes", () => {
      const schema = {
        type: "object",
        properties: {
          a: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
          b: { type: "object", properties: { y: { type: "number" } }, required: ["y"] },
        },
        required: ["a", "b"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Pair")).toBe(
        [
          "interface Pair {",
          "  readonly a: {",
          "    readonly x: number;",
          "  };",
          "  readonly b: {",
          "    readonly y: number;",
          "  };",
          "}",
        ].join("\n"),
      );
    });

    it("deduplicates identical shapes ignoring title/description differences", () => {
      const schema = {
        type: "object",
        properties: {
          from: { title: "Point", type: "object", properties: { x: { type: "number" } }, required: ["x"] },
          to: { description: "the end", type: "object", properties: { x: { type: "number" } }, required: ["x"] },
        },
        required: ["from", "to"],
      } as const satisfies Schema;
      // First-seen title ("Point") wins the common name; both reference it.
      expect(Schema.toTypeScript(schema, "Seg")).toBe(
        [
          "interface Point {",
          "  readonly x: number;",
          "}",
          "",
          "interface Seg {",
          "  readonly from: Point;",
          "  // the end",
          "  readonly to: Point;",
          "}",
        ].join("\n"),
      );
    });

    it("hoists an object used as a repeated fixed-tuple element", () => {
      const schema = {
        type: "array",
        items: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
        minItems: 2,
        maxItems: 2,
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Pair")).toBe(
        [
          "interface Shape1 {",
          "  readonly x: number;",
          "}",
          "",
          "type Pair = readonly [Shape1, Shape1];",
        ].join("\n"),
      );
    });

    it("disambiguates when two distinct repeated shapes derive the same name", () => {
      const shapeP = { type: "object", properties: { p: { type: "number" } }, required: ["p"] } as const;
      const shapeQ = { type: "object", properties: { q: { type: "number" } }, required: ["q"] } as const;
      // Both inner shapes repeat via the `item` key, so both derive the name "Item".
      const schema = {
        type: "object",
        properties: {
          first: { type: "object", properties: { w: { type: "number" }, item: shapeP }, required: ["w", "item"] },
          second: { type: "object", properties: { z: { type: "number" }, item: shapeP }, required: ["z", "item"] },
          third: { type: "object", properties: { m: { type: "number" }, item: shapeQ }, required: ["m", "item"] },
          fourth: { type: "object", properties: { n: { type: "number" }, item: shapeQ }, required: ["n", "item"] },
        },
        required: ["first", "second", "third", "fourth"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Root")).toBe(
        [
          "interface Item {",
          "  readonly p: number;",
          "}",
          "",
          "interface Item2 {",
          "  readonly q: number;",
          "}",
          "",
          "interface Root {",
          "  readonly first: {",
          "    readonly w: number;",
          "    readonly item: Item;",
          "  };",
          "  readonly second: {",
          "    readonly z: number;",
          "    readonly item: Item;",
          "  };",
          "  readonly third: {",
          "    readonly m: number;",
          "    readonly item: Item2;",
          "  };",
          "  readonly fourth: {",
          "    readonly n: number;",
          "    readonly item: Item2;",
          "  };",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("descriptions as comments", () => {
    it("comments a top-level type alias", () => {
      expect(Schema.toTypeScript({ type: "string", description: "the id" }, "Id")).toBe(
        ["// the id", "type Id = string;"].join("\n"),
      );
    });

    it("comments an interface and its properties", () => {
      const schema = {
        type: "object",
        description: "A 2D point",
        properties: {
          x: { type: "number", description: "the x coordinate" },
          y: { type: "number" },
        },
        required: ["x", "y"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Point")).toBe(
        [
          "// A 2D point",
          "interface Point {",
          "  // the x coordinate",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
        ].join("\n"),
      );
    });

    it("comments a function-typed property", () => {
      const schema = {
        type: "object",
        properties: {
          run: {
            type: "function",
            description: "runs the job",
            signature: { returns: { type: "promise", value: { type: "null" } } },
          },
        },
        required: ["run"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Svc")).toBe(
        [
          "interface Svc {",
          "  // runs the job",
          "  readonly run: () => Promise<null>;",
          "}",
        ].join("\n"),
      );
    });

    it("suppresses a property comment that repeats the referenced type's own comment", () => {
      const point = {
        description: "A point",
        type: "object",
        properties: { x: { type: "number" } },
        required: ["x"],
      } as const;
      const schema = {
        type: "object",
        properties: { from: point, to: point },
        required: ["from", "to"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Seg")).toBe(
        [
          "// A point",
          "interface From {",
          "  readonly x: number;",
          "}",
          "",
          "interface Seg {",
          "  readonly from: From;",
          "  readonly to: From;",
          "}",
        ].join("\n"),
      );
    });

    it("keeps a property comment that differs from the referenced type's comment", () => {
      const schema = {
        type: "object",
        properties: {
          from: { description: "A point", type: "object", properties: { x: { type: "number" } }, required: ["x"] },
          to: { description: "the origin", type: "object", properties: { x: { type: "number" } }, required: ["x"] },
        },
        required: ["from", "to"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Seg")).toBe(
        [
          "// A point",
          "interface From {",
          "  readonly x: number;",
          "}",
          "",
          "interface Seg {",
          "  readonly from: From;",
          "  // the origin",
          "  readonly to: From;",
          "}",
        ].join("\n"),
      );
    });

    it("renders a multi-line description as multiple comment lines", () => {
      const schema = {
        type: "object",
        properties: { x: { type: "number", description: "line one\nline two" } },
        required: ["x"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "M")).toBe(
        [
          "interface M {",
          "  // line one",
          "  // line two",
          "  readonly x: number;",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("named parameters", () => {
    it("uses parameter names in a single-line signature", () => {
      const schema = {
        type: "function",
        signature: {
          parameters: [
            { name: "x", schema: { type: "number" } },
            { name: "y", schema: { type: "number" } },
          ],
          returns: { type: "null" },
        },
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "F")).toBe("type F = (x: number, y: number) => null;");
    });

    it("breaks parameters onto their own lines with independent descriptions", () => {
      const vec2 = {
        title: "Vec2",
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
      } as const;
      const schema = {
        type: "object",
        properties: {
          move: {
            type: "function",
            signature: {
              parameters: [
                { name: "position", description: "in meters", schema: vec2 },
                { name: "velocity", description: "in meters/second", schema: vec2 },
              ],
            },
          },
        },
        required: ["move"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "Body")).toBe(
        [
          "interface Vec2 {",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
          "",
          "interface Body {",
          "  readonly move: (",
          "    // in meters",
          "    position: Vec2,",
          "    // in meters/second",
          "    velocity: Vec2,",
          "  ) => void;",
          "}",
        ].join("\n"),
      );
    });
  });

  describe("propertyMeta descriptions", () => {
    it("documents properties independently of a shared property type", () => {
      const vec2 = {
        title: "Vec2",
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
      } as const;
      const schema = {
        type: "object",
        properties: { position: vec2, velocity: vec2 },
        propertyMeta: {
          position: { description: "in meters" },
          velocity: { description: "in meters/second" },
        },
        required: ["position", "velocity"],
      } as const satisfies Schema;
      expect(Schema.toTypeScript(schema, "State")).toBe(
        [
          "interface Vec2 {",
          "  readonly x: number;",
          "  readonly y: number;",
          "}",
          "",
          "interface State {",
          "  // in meters",
          "  readonly position: Vec2;",
          "  // in meters/second",
          "  readonly velocity: Vec2;",
          "}",
        ].join("\n"),
      );
    });

    it("wins over the property type's own description and is never suppressed", () => {
      const vec2 = {
        title: "Vec2",
        description: "A vector",
        type: "object",
        properties: { x: { type: "number" } },
        required: ["x"],
      } as const;
      const schema = {
        type: "object",
        properties: { a: vec2, b: vec2 },
        propertyMeta: { a: { description: "left" } },
        required: ["a", "b"],
      } as const satisfies Schema;
      // Vec2's own doc lands on the interface; `a` overrides with its field doc; `b`
      // falls back to the type doc, which is suppressed because it repeats the interface.
      expect(Schema.toTypeScript(schema, "Pair")).toBe(
        [
          "// A vector",
          "interface Vec2 {",
          "  readonly x: number;",
          "}",
          "",
          "interface Pair {",
          "  // left",
          "  readonly a: Vec2;",
          "  readonly b: Vec2;",
          "}",
        ].join("\n"),
      );
    });

    it("does not affect structural shape identity", () => {
      const schema = {
        type: "object",
        properties: {
          from: { type: "object", properties: { x: { type: "number" } }, required: ["x"], propertyMeta: { x: { description: "start" } } },
          to: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
        },
        required: ["from", "to"],
      } as const satisfies Schema;
      // Both `from` and `to` are the same shape despite `from`'s propertyMeta, so they
      // share one hoisted interface (named from the first key, "From").
      expect(Schema.toTypeScript(schema, "Seg")).toBe(
        [
          "interface From {",
          "  // start",
          "  readonly x: number;",
          "}",
          "",
          "interface Seg {",
          "  readonly from: From;",
          "  readonly to: From;",
          "}",
        ].join("\n"),
      );
    });
  });
});
