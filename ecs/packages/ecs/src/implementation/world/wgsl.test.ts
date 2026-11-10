// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from "vitest";
import type { Program } from "./kernel.js";
import { generateWgsl } from "./wgsl.js";
import type { WasmColumn } from "./wasm.js";

const columns: readonly WasmColumn[] = [{ view: "f32", stride: 4, offset: 0, boolean: false, component: 0 }];

describe("generateWgsl", () => {
    test("names locals after their JS names, made valid WGSL identifiers", () => {
        const program: Program = {
            locals: 3,
            names: ["speed_0", "$value_1", "__hidden_2"],
            body: [0, 1, 2].map(local => ({ kind: "set", local, value: { kind: "column", column: 0 } })),
        };
        const kernel = generateWgsl(program, columns, () => "number");
        const code = typeof kernel === "string" ? kernel : kernel.code;
        expect(code).toContain("var speed_0: f32");
        expect(code).toContain("var v_value_1: f32");
        expect(code).toContain("var v__hidden_2: f32");
    });

    test("uses WGSL's own operations where JS differs only for NaN or infinite values", () => {
        const a: Program.Expression = { kind: "column", column: 0 };
        const program: Program = {
            locals: 0,
            body: [{
                kind: "store", column: 0, value: {
                    kind: "binary", operator: "+",
                    left: { kind: "math", name: "min", arguments: [a, { kind: "math", name: "asinh", arguments: [a] }] },
                    right: { kind: "binary", operator: "%", left: a, right: { kind: "number", value: 1.5 } },
                },
            }],
        };
        const kernel = generateWgsl(program, columns, () => "number");
        const code = typeof kernel === "string" ? kernel : kernel.code;
        expect(code).toContain("min(bitcast<f32>");
        expect(code).toContain("asinh(");
        expect(code).toMatch(/\) % 1\.5e\+0f\)/);
        expect(code).not.toMatch(/jsMin|remainder|isNan/);
    });
});

describe("generateWgsl typed array resources", () => {
    const element: Program.Expression = { kind: "column", column: 0 };
    const readThenWrite: Program = {
        locals: 0,
        body: [
            { kind: "store", column: 0, value: { kind: "resourceElement", index: 0, element } },
            { kind: "resourceStore", index: 0, element, value: { kind: "number", value: 3 } },
        ],
    };
    const generate = (name: string | null) => generateWgsl(readThenWrite, columns, () => "number", [], () => "u32", () => name === null ? null : { name: name as "Uint8Array", length: 8 });

    test("address an array's elements a word each from its record's address and length, NaN or nothing past its ends", () => {
        const kernel = generate("Uint8Array");
        if (typeof kernel === "string") throw new Error(kernel);
        // After the row count and the column's address: the array's address, then its length.
        expect(kernel.scalars).toEqual([{ source: "resource", index: 0, path: ["address"] }, { source: "resource", index: 0, path: ["length"] }]);
        expect(kernel.code).toContain("select(bitcast<f32>(nanBits), f32(memory[parameters[2] + min(u32(");
        expect(kernel.code).toContain(", parameters[3])] & 0xFFu)");
        expect(kernel.code).toMatch(/if \(.*< f32\(parameters\[3\]\).*\) \{ memory\[parameters\[2\] \+ u32\(.*\)\] = 3u; \}/);
    });

    test("refuse a resource that isn't a typed array, and an array of 8-byte elements", () => {
        expect(generate(null)).toBe("it indexes a resource that isn't a typed array");
        expect(generate("Float64Array")).toBe("it indexes a Float64Array, whose 8-byte elements the GPU doesn't hold");
    });
});

describe("generateWgsl remainders", () => {
    const remainderOf = (view: "u32" | "i32" | "f32", divisor: number): string => {
        const program: Program = { locals: 0, body: [{ kind: "store", column: 1, value: { kind: "binary", operator: "%", left: { kind: "column", column: 0 }, right: { kind: "number", value: divisor } } }] };
        const kernel = generateWgsl(program, [{ view, stride: 4, offset: 0, boolean: false, component: 0 }, { view: "f32", stride: 4, offset: 0, boolean: false, component: 1 }], () => "number");
        if (typeof kernel === "string") throw new Error(kernel);
        return kernel.code;
    };

    test("keep integers' remainders in their integer type, exact past an f32's 24 bits, and numbers' in f32", () => {
        expect(remainderOf("u32", 17)).toContain("(memory[parameters[1] + row * 1u + 0u] % 17u)");
        expect(remainderOf("i32", -6)).toContain("(bitcast<i32>(memory[parameters[1] + row * 1u + 0u]) % bitcast<i32>(4294967290u))");
        expect(remainderOf("f32", 17)).toContain("(bitcast<f32>(memory[parameters[1] + row * 1u + 0u]) % 17.0f)");
    });
});
