// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createEnumBuffer } from "./create-enum-buffer.js";
import { createTypedBuffer } from "./create-typed-buffer.js";
import type { Schema } from "../schema/index.js";

describe("createEnumBuffer", () => {
    describe("get and set", () => {
        it("should store and retrieve string enum values", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 3);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");

            expect(buf.get(0)).toBe("a");
            expect(buf.get(1)).toBe("b");
            expect(buf.get(2)).toBe("c");
        });

        it("should store and retrieve number enum values", () => {
            const schema: Schema = { enum: [10, 20, 30], default: 10 };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, 20);
            buf.set(1, 30);

            expect(buf.get(0)).toBe(20);
            expect(buf.get(1)).toBe(30);
        });

        it("should store and retrieve boolean enum values", () => {
            const schema: Schema = { enum: [true, false], default: true };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, true);
            buf.set(1, false);

            expect(buf.get(0)).toBe(true);
            expect(buf.get(1)).toBe(false);
        });

        it("should store and retrieve mixed-type enum values", () => {
            const schema: Schema = { enum: ["a", 12, false, null], default: "a" };
            const buf = createEnumBuffer(schema, 4);
            buf.set(0, "a");
            buf.set(1, 12);
            buf.set(2, false);
            buf.set(3, null);

            expect(buf.get(0)).toBe("a");
            expect(buf.get(1)).toBe(12);
            expect(buf.get(2)).toBe(false);
            expect(buf.get(3)).toBe(null);
        });

        it("should throw on set with a value not in the enum", () => {
            const schema: Schema = { enum: ["x", "y"], default: "x" };
            const buf = createEnumBuffer(schema, 1);

            expect(() => buf.set(0, "z")).toThrow(
                /Value "z" is not a valid enum value/
            );
        });
    });

    describe("construction errors", () => {
        it("should throw if enum has more than 256 values", () => {
            const values = Array.from({ length: 257 }, (_, i) => `val${i}`);
            const schema: Schema = { enum: values, default: values[0] };

            expect(() => createEnumBuffer(schema, 1)).toThrow(
                /257 values.*maximum is 256/
            );
        });

        it("should accept exactly 256 values", () => {
            const values = Array.from({ length: 256 }, (_, i) => i);
            const schema: Schema = { enum: values, default: 0 };

            const buf = createEnumBuffer(schema, 2);
            buf.set(0, 0);
            buf.set(1, 255);
            expect(buf.get(0)).toBe(0);
            expect(buf.get(1)).toBe(255);
        });
    });

    describe("isDefault", () => {
        it("should return true for unset slots (default is first enum value)", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 3);

            expect(buf.isDefault(0)).toBe(true);
            expect(buf.isDefault(1)).toBe(true);
            expect(buf.isDefault(2)).toBe(true);
        });

        it("should return false after setting a non-default value", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, "b");

            expect(buf.isDefault(0)).toBe(false);
            expect(buf.isDefault(1)).toBe(true);
        });

        it("should use schema.default when it is not the first enum value", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "b" };
            const buf = createEnumBuffer(schema, 2);

            expect(buf.isDefault(0)).toBe(true);
            expect(buf.get(0)).toBe("b");

            buf.set(0, "a");
            expect(buf.isDefault(0)).toBe(false);

            buf.set(1, "b");
            expect(buf.isDefault(1)).toBe(true);
        });

        it("should default to index 0 when schema.default is not provided", () => {
            const schema: Schema = { enum: ["x", "y"] };
            const buf = createEnumBuffer(schema, 1);

            expect(buf.isDefault(0)).toBe(true);
            expect(buf.get(0)).toBe("x");
        });
    });

    describe("copyWithin", () => {
        it("should copy elements within the buffer", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 4);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");
            buf.set(3, "a");

            buf.copyWithin(2, 0, 2);

            expect(buf.get(0)).toBe("a");
            expect(buf.get(1)).toBe("b");
            expect(buf.get(2)).toBe("a");
            expect(buf.get(3)).toBe("b");
        });
    });

    describe("slice", () => {
        it("should return all values when called without arguments", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 3);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");

            expect(Array.from(buf.slice())).toEqual(["a", "b", "c"]);
        });

        it("should return a partial slice", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 4);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");
            buf.set(3, "a");

            expect(Array.from(buf.slice(1, 3))).toEqual(["b", "c"]);
        });
    });

    describe("copy", () => {
        it("should produce an independent clone", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 3);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");

            const clone = buf.copy();

            expect(clone.get(0)).toBe("a");
            expect(clone.get(1)).toBe("b");
            expect(clone.get(2)).toBe("c");
            expect(clone.capacity).toBe(3);

            buf.set(0, "c");
            expect(clone.get(0)).toBe("a");
        });

        it("should have an independent typed array backing", () => {
            const schema: Schema = { enum: [1, 2, 3], default: 1 };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, 2);

            const clone = buf.copy();
            const srcTA = buf.getTypedArray();
            const dstTA = clone.getTypedArray();

            expect(dstTA).not.toBe(srcTA);
            expect(dstTA.buffer).not.toBe(srcTA.buffer);
        });
    });

    describe("getTypedArray", () => {
        it("should return a Uint8Array", () => {
            const schema: Schema = { enum: ["a", "b"], default: "a" };
            const buf = createEnumBuffer(schema, 4);

            const ta = buf.getTypedArray();
            expect(ta).toBeInstanceOf(Uint8Array);
            expect(ta.length).toBe(4);
        });
    });

    describe("capacity resize", () => {
        it("should preserve data when growing", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, "b");
            buf.set(1, "c");

            buf.capacity = 4;

            expect(buf.capacity).toBe(4);
            expect(buf.get(0)).toBe("b");
            expect(buf.get(1)).toBe("c");
        });

        it("should truncate data when shrinking", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "a" };
            const buf = createEnumBuffer(schema, 4);
            buf.set(0, "a");
            buf.set(1, "b");
            buf.set(2, "c");
            buf.set(3, "a");

            buf.capacity = 2;

            expect(buf.capacity).toBe(2);
            expect(buf.get(0)).toBe("a");
            expect(buf.get(1)).toBe("b");
        });

        it("should fill new slots with default when growing and default is not index 0", () => {
            const schema: Schema = { enum: ["a", "b", "c"], default: "b" };
            const buf = createEnumBuffer(schema, 2);
            buf.set(0, "c");

            buf.capacity = 4;

            expect(buf.get(0)).toBe("c");
            expect(buf.get(1)).toBe("b");
            expect(buf.get(2)).toBe("b");
            expect(buf.get(3)).toBe("b");
        });
    });

    describe("type and metadata", () => {
        it('should have type "enum"', () => {
            const schema: Schema = { enum: ["a", "b"], default: "a" };
            const buf = createEnumBuffer(schema, 1);
            expect(buf.type).toBe("enum");
        });

        it("should have typedArrayElementSizeInBytes of 1", () => {
            const schema: Schema = { enum: ["a", "b"], default: "a" };
            const buf = createEnumBuffer(schema, 1);
            expect(buf.typedArrayElementSizeInBytes).toBe(1);
        });
    });
});

describe("createTypedBuffer enum integration", () => {
    it("should auto-select enum buffer when schema has enum property", () => {
        const schema = { enum: ["landscape", "portrait"] } as const;
        const buf = createTypedBuffer(schema, 2);

        expect(buf.type).toBe("enum");
        buf.set(0, "landscape");
        buf.set(1, "portrait");
        expect(buf.get(0)).toBe("landscape");
        expect(buf.get(1)).toBe("portrait");
    });

    it("should prefer enum over number for integer enum schemas", () => {
        const schema = { type: "integer", enum: [0, 1, 2] } as const;
        const buf = createTypedBuffer(schema, 3);

        expect(buf.type).toBe("enum");
    });

    it("should prefer enum over array for string enum schemas", () => {
        const schema = { type: "string", enum: ["a", "b", "c"] } as const;
        const buf = createTypedBuffer(schema, 2);

        expect(buf.type).toBe("enum");
    });

    it("should prefer const over enum when both are present", () => {
        const schema = { const: "a", enum: ["a", "b"] } as const;
        const buf = createTypedBuffer(schema, 1);

        expect(buf.type).toBe("const");
    });

    it("should support initial values array", () => {
        const schema = { enum: ["x", "y", "z"] } as const;
        const buf = createTypedBuffer(schema, ["x", "z", "y"]);

        expect(buf.get(0)).toBe("x");
        expect(buf.get(1)).toBe("z");
        expect(buf.get(2)).toBe("y");
    });
});
