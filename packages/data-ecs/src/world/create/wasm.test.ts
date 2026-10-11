import { describe, expect, it } from "vitest";
import type { Program } from "./kernel.js";
import { generateWasm, importsOf, type WasmColumn } from "./wasm.js";

type Expression = Program.Expression;

const views = { f32: Float32Array, f64: Float64Array, i32: Int32Array, u32: Uint32Array, boolean: Uint8Array, entity: Float64Array, changed: Float64Array } as const;

/** Runs a program over one row per input value; column 0 is the input (f64), column 1 the output of kind `output`. */
const run = (output: WasmColumn, value: Expression, inputs: readonly number[]): number[] | null => {
    const program: Program = { locals: 0, body: [{ kind: "store", column: 1, value }] };
    const kernel = generateWasm(program, ["f64", output], () => "number");
    if (kernel === null) return null;
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
    const input = new Float64Array(memory.buffer, 0, inputs.length);
    input.set(inputs);
    const result = new views[output](memory.buffer, 4096, inputs.length);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) });
    const runKernel: unknown = instance.exports.run;
    if (typeof runKernel !== "function") throw new Error("no run export");
    runKernel(0, inputs.length, 0, 0, 4096);
    return Array.from(result, Number);
};

const input: Expression = { kind: "column", column: 0 };
const edges = [0, -0, 0.5, -0.5, 3.7, -3.7, 2 ** 31, -(2 ** 31) - 1, 2 ** 32 + 5, -(2 ** 32) - 5, 2 ** 53 + 2, 1e20, -1e300, NaN, Infinity, -Infinity, 1 / 3];

/** The same store through a typed array, which is what the JS kernel does. */
const viaTypedArray = (output: keyof typeof views, values: readonly number[]): number[] => Array.from(new views[output](values), Number);

describe("generateWasm", () => {
    it("stores with typed-array conversion, for every edge value", () => {
        for (const output of ["f32", "f64", "i32", "u32", "boolean"] as const) {
            expect([output, run(output, input, edges)]).toEqual([output, viaTypedArray(output, edges)]);
        }
    });

    it("matches JS for bitwise operators, which convert through ToInt32", () => {
        const cases: [Program.Expression, (x: number) => number][] = [
            [{ kind: "binary", operator: "|", left: input, right: { kind: "number", value: 0 } }, x => x | 0],
            [{ kind: "binary", operator: ">>>", left: input, right: { kind: "number", value: 1 } }, x => x >>> 1],
            [{ kind: "binary", operator: "<<", left: input, right: { kind: "number", value: 33 } }, x => x << 33],
            [{ kind: "unary", operator: "~", operand: input }, x => ~x],
            [{ kind: "math", name: "imul", arguments: [input, { kind: "number", value: 3 }] }, x => Math.imul(x, 3)],
            [{ kind: "math", name: "clz32", arguments: [input] }, x => Math.clz32(x)],
        ];
        for (const [expression, expected] of cases) expect(run("f64", expression, edges)).toEqual(edges.map(expected));
    });

    it("matches JS truthiness, including NaN and -0, and returns operand values from && and ||", () => {
        const truthy: Expression = { kind: "conditional", test: input, consequent: { kind: "number", value: 1 }, alternate: { kind: "number", value: 2 } };
        expect(run("f64", truthy, edges)).toEqual(edges.map(x => x ? 1 : 2));
        const and: Expression = { kind: "logical", operator: "&&", left: input, right: { kind: "number", value: 7 } };
        expect(run("f64", and, edges)).toEqual(edges.map(x => x && 7));
        const or: Expression = { kind: "logical", operator: "||", left: input, right: { kind: "number", value: 7 } };
        expect(run("f64", or, edges)).toEqual(edges.map(x => x || 7));
    });

    it("matches JS for imported and native Math", () => {
        const cases: [Expression, (x: number) => number][] = [
            [{ kind: "binary", operator: "%", left: input, right: { kind: "number", value: 2.5 } }, x => x % 2.5],
            [{ kind: "binary", operator: "**", left: input, right: { kind: "number", value: 0.5 } }, x => x ** 0.5],
            [{ kind: "math", name: "round", arguments: [input] }, x => Math.round(x)],
            [{ kind: "math", name: "sin", arguments: [input] }, x => Math.sin(x)],
            [{ kind: "math", name: "max", arguments: [input, { kind: "number", value: -0 }] }, x => Math.max(x, -0)],
            [{ kind: "math", name: "fround", arguments: [input] }, x => Math.fround(x)],
        ];
        for (const [expression, expected] of cases) expect(run("f64", expression, edges)).toEqual(edges.map(expected));
    });

    it("never strictly equates a boolean and a number, and falls back when it can't tell", () => {
        const booleanVersusNumber: Expression = { kind: "binary", operator: "===", left: { kind: "boolean", value: true }, right: { kind: "number", value: 1 } };
        expect(run("f64", booleanVersusNumber, [0])).toEqual([0]);
        const mixed: Expression = { kind: "logical", operator: "&&", left: input, right: { kind: "boolean", value: true } };
        expect(run("f64", { kind: "binary", operator: "===", left: mixed, right: { kind: "boolean", value: true } }, [0])).toBeNull();
    });

    it("branches like structured WASM: a loop summing 1 to the input, with next ending the row", () => {
        const local = (index: number): Expression => ({ kind: "local", local: index });
        const program: Program = {
            locals: 2,
            body: [
                { kind: "set", local: 0, value: { kind: "number", value: 0 } },
                { kind: "set", local: 1, value: { kind: "number", value: 1 } },
                { kind: "if", test: { kind: "binary", operator: "<", left: input, right: { kind: "number", value: 0 } }, consequent: [{ kind: "next" }], alternate: [] },
                {
                    kind: "block", body: [{
                        kind: "loop", body: [
                            { kind: "branchIf", depth: 1, test: { kind: "binary", operator: ">", left: local(1), right: input } },
                            { kind: "set", local: 0, value: { kind: "binary", operator: "+", left: local(0), right: local(1) } },
                            { kind: "set", local: 1, value: { kind: "binary", operator: "+", left: local(1), right: { kind: "number", value: 1 } } },
                            { kind: "branch", depth: 0 },
                        ],
                    }],
                },
                { kind: "store", column: 1, value: local(0) },
            ],
        };
        const kernel = generateWasm(program, ["f64", "f64"], () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Float64Array(memory.buffer, 0, 3).set([4, -1, 10]);
        const output = new Float64Array(memory.buffer, 4096, 3).fill(99);
        const runKernel: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(0, 3, 0, 0, 4096);
        expect([...output]).toEqual([10, 99, 55]);
    });
});
