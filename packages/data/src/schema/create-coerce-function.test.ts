// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { createCoerceFunction } from "./create-coerce-function.js";
import { Schema } from "./index.js";
import type { Schema as SchemaType } from "./schema.js";

const num = { type: "number" } as const satisfies SchemaType;
const f32 = { type: "number", precision: 1 } as const satisfies SchemaType;
const bool = { type: "boolean" } as const satisfies SchemaType;
const str = { type: "string" } as const satisfies SchemaType;

// createCoerceFunction never returns null in the "possible" cases — narrow it.
const coercer = (input: SchemaType, output: SchemaType) => {
    const fn = createCoerceFunction(input, output);
    expect(fn).not.toBeNull();
    return fn!;
};

describe("createCoerceFunction — numbers", () => {
    it("number → number with no bounds is identity (F64→F32 precision loss is the buffer's job)", () => {
        const fn = coercer(num, f32);
        expect(fn(3.14159)).toBe(3.14159);
        expect(fn(-100)).toBe(-100);
    });

    it("clamps to the output maximum / minimum when declared", () => {
        expect(coercer(num, { type: "number", maximum: 100 })(150)).toBe(100);
        expect(coercer(num, { type: "number", maximum: 100 })(50)).toBe(50);
        expect(coercer(num, { type: "number", minimum: 0 })(-5)).toBe(0);
        const both = coercer(num, { type: "number", minimum: 0, maximum: 10 });
        expect([both(-1), both(5), both(99)]).toEqual([0, 5, 10]);
    });

    it("caps a wide integer down to a narrow integer range (the U32→'U16' case)", () => {
        const fn = coercer({ type: "integer" }, { type: "integer", minimum: 0, maximum: 65535 });
        expect(fn(70000)).toBe(65535);
        expect(fn(-5)).toBe(0);
        expect(fn(40000)).toBe(40000);
    });
});

describe("createCoerceFunction — scalars & enums", () => {
    it("boolean → boolean and string → string are identity", () => {
        expect(coercer(bool, bool)(true)).toBe(true);
        expect(coercer(str, str)("hi")).toBe("hi");
    });

    it("enum → enum only when every input value is an output value", () => {
        const widen = coercer({ enum: ["a", "b"] }, { enum: ["a", "b", "c"] });
        expect(widen("a")).toBe("a");
        expect(createCoerceFunction({ enum: ["a", "z"] }, { enum: ["a", "b"] })).toBeNull();
    });

    it("→ const collapses any input to the constant", () => {
        const fn = coercer(num, { const: 42 });
        expect(fn(1)).toBe(42);
        expect(fn(999)).toBe(42);
    });
});

describe("createCoerceFunction — objects", () => {
    it("reorders fields (order is irrelevant to the produced value)", () => {
        const fn = coercer(
            { type: "object", properties: { x: f32, y: f32 } },
            { type: "object", properties: { y: f32, x: f32 } },
        );
        expect(fn({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    });

    it("fills a new field from its default", () => {
        const fn = coercer(
            { type: "object", properties: { x: f32, y: f32 } },
            { type: "object", properties: { x: f32, y: f32, z: { type: "number", default: 9 } } },
        );
        expect(fn({ x: 1, y: 2 })).toEqual({ x: 1, y: 2, z: 9 });
    });

    it("requires a default for a new field of a numeric STRUCT (every field is packed)", () => {
        // f32 properties pack as a struct → a missing field would be NaN, so a
        // new field without a default makes the conversion impossible.
        expect(createCoerceFunction(
            { type: "object", properties: { x: f32 } },
            { type: "object", properties: { x: f32, z: f32 } },
        )).toBeNull();
    });

    it("omits a new NON-required field with no default on a plain object", () => {
        // f64 properties do not pack as a struct → a plain object may simply lack
        // an optional field, so this is convertible and the field is left off.
        const fn = coercer(
            { type: "object", properties: { a: num } },
            { type: "object", properties: { a: num, b: num } },
        );
        expect(fn({ a: 1 })).toEqual({ a: 1 });
    });

    it("still requires a default for a new REQUIRED field on a plain object", () => {
        expect(createCoerceFunction(
            { type: "object", properties: { a: num } },
            { type: "object", properties: { a: num, b: num }, required: ["b"] },
        )).toBeNull();
    });

    it("drops fields the output does not declare", () => {
        const fn = coercer(
            { type: "object", properties: { x: f32, y: f32, z: f32 } },
            { type: "object", properties: { x: f32, y: f32 } },
        );
        expect(fn({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2 });
    });

    it("coerces (and clamps) a retyped field", () => {
        const fn = coercer(
            { type: "object", properties: { x: num } },
            { type: "object", properties: { x: { type: "integer", minimum: 0, maximum: 10 } } },
        );
        expect(fn({ x: 50 })).toEqual({ x: 10 });
    });

    it("gives each element its own copy of an object default (no aliasing)", () => {
        const fn = coercer(
            { type: "object", properties: { x: f32 } },
            { type: "object", properties: { x: f32, meta: { type: "object", properties: { n: { type: "number", default: 0 } } } } },
        );
        const a = fn({ x: 1 }) as { meta: object };
        const b = fn({ x: 2 }) as { meta: object };
        expect(a.meta).toEqual({ n: 0 });
        expect(a.meta).not.toBe(b.meta); // distinct instances
    });

    it("is not convertible when an existing sub-field cannot be converted", () => {
        // Nested numeric struct gains a defaultless field ⇒ the sub-conversion,
        // and therefore the whole conversion, is impossible.
        expect(createCoerceFunction(
            { type: "object", properties: { p: { type: "object", properties: { x: f32 } } } },
            { type: "object", properties: { p: { type: "object", properties: { x: f32, y: f32 } } } },
        )).toBeNull();
    });
});

describe("createCoerceFunction — arrays", () => {
    it("extends a fixed vector, filling from the item default (vec3 → vec4)", () => {
        const fn = coercer(
            { type: "array", items: f32, minItems: 3, maxItems: 3 },
            { type: "array", items: { type: "number", default: 0 }, minItems: 4, maxItems: 4 },
        );
        expect(fn([1, 2, 3])).toEqual([1, 2, 3, 0]);
    });

    it("is not convertible when a longer fixed output has no item default", () => {
        expect(createCoerceFunction(
            { type: "array", items: f32, minItems: 3, maxItems: 3 },
            { type: "array", items: f32, minItems: 4, maxItems: 4 },
        )).toBeNull();
    });

    it("truncates a fixed vector (vec3 → vec2)", () => {
        const fn = coercer(
            { type: "array", items: f32, minItems: 3, maxItems: 3 },
            { type: "array", items: f32, minItems: 2, maxItems: 2 },
        );
        expect(fn([1, 2, 3])).toEqual([1, 2]);
    });

    it("maps every element of a variable-length array (with clamp)", () => {
        const fn = coercer(
            { type: "array", items: num },
            { type: "array", items: { type: "integer", minimum: 0, maximum: 5 } },
        );
        expect(fn([1, 10, 3])).toEqual([1, 5, 3]);
    });
});

describe("createCoerceFunction — incompatible kinds return null", () => {
    it.each([
        ["number → object", num, { type: "object", properties: { x: f32 } } as SchemaType],
        ["object → number", { type: "object", properties: { x: f32 } } as SchemaType, num],
        ["number → boolean", num, bool],
        ["number → enum", num, { enum: [1, 2, 3] } as SchemaType],
        ["array → object", { type: "array", items: num } as SchemaType, { type: "object", properties: { x: f32 } } as SchemaType],
    ])("%s", (_label, input, output) => {
        expect(createCoerceFunction(input, output)).toBeNull();
    });
});

describe("createCoerceFunction — namespace exposure", () => {
    it("is reachable as Schema.createCoerceFunction", () => {
        expect(typeof Schema.createCoerceFunction).toBe("function");
        expect(Schema.createCoerceFunction(num, f32)!(1.5)).toBe(1.5);
    });
});
