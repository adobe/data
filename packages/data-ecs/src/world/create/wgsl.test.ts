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
