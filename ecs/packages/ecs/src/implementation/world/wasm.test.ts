// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { blockShift, type Program } from "./kernel.js";
import { printWat } from "../compiler/wat.js";
import { generateWasm, importsOf, type WasmColumn } from "./wasm.js";

type Expression = Program.Expression;

const views = { f32: Float32Array, f64: Float64Array, i32: Int32Array, u32: Uint32Array, boolean: Uint8Array } as const;
type Output = keyof typeof views;

/** A dense column; each test column is its own component. */
const dense = (output: Output, component: number): WasmColumn => output === "boolean"
    ? { view: "u8", stride: 1, offset: 0, boolean: true, component }
    : { view: output, stride: output === "f64" ? 8 : 4, offset: 0, boolean: false, component };

/** Runs a program over one row per input value; column 0 is the input (f64), column 1 the output of kind `output`. */
const run = (output: Output, value: Expression, inputs: readonly number[]): number[] | null => {
    const program: Program = { locals: 0, body: [{ kind: "store", column: 1, value }] };
    const kernel = generateWasm(program, [dense("f64", 0), dense(output, 1)], () => "number", false);
    if (kernel === null) return null;
    const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
    const input = new Float64Array(memory.buffer, 0, inputs.length);
    input.set(inputs);
    const result = new views[output](memory.buffer, 4096, inputs.length);
    const instance = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) });
    const runKernel: unknown = instance.exports.run;
    if (typeof runKernel !== "function") throw new Error("no run export");
    runKernel(0, inputs.length, 0, -1, 0, 4096);
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

    it("addresses interleaved columns by stride and offset, leaving the rest of each element untouched", () => {
        // Column 1 is the z of a WGSL-storage vec3<f32>: 16-byte elements, at byte 8.
        const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value: input }] }, [dense("f64", 0), { view: "f32", stride: 16, offset: 8, boolean: false, component: 1 }], () => "number", false);
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Float64Array(memory.buffer, 0, 3).set([1.5, 2.5, 3.5]);
        const output = new Float32Array(memory.buffer, 4096, 12).fill(-1);
        const runKernel: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(0, 3, 0, -1, 0, 4096);
        expect([...output]).toEqual([-1, -1, 1.5, -1, -1, -1, 2.5, -1, -1, -1, 3.5, -1]);
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
        const kernel = generateWasm(program, [dense("f64", 0), dense("f64", 1)], () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Float64Array(memory.buffer, 0, 3).set([4, -1, 10]);
        const output = new Float64Array(memory.buffer, 4096, 3).fill(99);
        const runKernel: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(0, 3, 0, -1, 0, 4096);
        expect([...output]).toEqual([10, 99, 55]);
    });
});

describe("generateWasm with SIMD", () => {
    /** Runs a program over `rows` rows; `layout` gives each column's element stride, offset and component. */
    const runVector = (program: Program, columns: readonly WasmColumn[], fill: (views: Float32Array[], ticks: Float64Array) => void, rows: number, tick = 7) => {
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const bases = columns.map(column => 4096 * (Math.max(0, column.component) + 1));
        const floats = columns.map((_, k) => new Float32Array(memory.buffer, bases[k], 512));
        const ticks = new Float64Array(memory.buffer, 4096 * 8, 64);
        const chunks = new Float64Array(memory.buffer, 4096 * 9, 4);
        const blocks = new Float64Array(memory.buffer, 4096 * 10, 4);
        fill(floats, ticks);
        const runKernel: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        // f64 columns are ticks, then their chunks, then their blocks.
        const tickBase = (component: number): number => component === -3 ? 4096 * 10 : component === -2 ? 4096 * 9 : 4096 * 8;
        runKernel(0, rows, tick, -1, ...bases.map((base, k) => columns[k].view !== "f64" ? base : tickBase(columns[k].component)));
        return { kernel, floats, ticks, chunks, blocks };
    };
    const column = (component: number, stride: number, offset: number): WasmColumn => ({ view: "f32", stride, offset, boolean: false, component });
    const read = (k: number): Expression => ({ kind: "column", column: k });
    const add = (left: Expression, right: Expression): Expression => ({ kind: "binary", operator: "+", left, right });

    it("adds dense f32 columns four rows at a time, then the tail", () => {
        const { kernel, floats } = runVector(
            { locals: 0, body: [{ kind: "store", column: 2, value: add(read(0), read(1)) }] },
            [column(0, 4, 0), column(1, 4, 0), column(2, 4, 0)],
            ([a, b, out]) => { a.set(Array.from({ length: 12 }, (_, i) => i + 0.1)); b.set(Array.from({ length: 12 }, (_, i) => i * 3.7)); out.fill(-1); },
            10,
        );
        expect(kernel.vectorized).toBe(true);
        const expected = Array.from({ length: 10 }, (_, i) => Math.fround(Math.fround(i + 0.1) + Math.fround(i * 3.7)));
        expect([...floats[2].subarray(0, 12)]).toEqual([...expected, -1, -1]);
    });

    for (const [name, stride, leafCount] of [["vec2 (8-byte stride)", 8, 2], ["tight vec3 (12-byte stride)", 12, 3], ["WGSL storage vec3 (16-byte stride with padding)", 16, 3]] as const) {
        it(`deinterleaves and reinterleaves a ${name}`, () => {
            const words = stride / 4;
            // p += v, leaf by leaf; columns 0..2 are p.x/y/z, 3..5 are v.x/y/z.
            const leaves = Array.from({ length: leafCount }, (_, leaf) => leaf);
            const program: Program = { locals: 0, body: leaves.map(leaf => ({ kind: "store", column: leaf, value: add(read(leaf), read(leafCount + leaf)) })) };
            const columns = [...leaves.map(leaf => column(0, stride, 4 * leaf)), ...leaves.map(leaf => column(1, stride, 4 * leaf))];
            const { kernel, floats } = runVector(program, columns, views => {
                const p = views[0];
                const v = views[leafCount];
                for (let i = 0; i < 64; i++) p[i] = words === 4 && i % 4 === 3 ? -9 : i;
                for (let i = 0; i < 64; i++) v[i] = 100 + i;
            }, 10);
            expect(kernel.vectorized).toBe(true);
            const p = floats[0];
            for (let row = 0; row < 12; row++) {
                for (let word = 0; word < words; word++) {
                    const index = row * words + word;
                    const padding = word === 3;
                    const expected = padding ? -9 : row < 10 ? index + 100 + index : index;
                    expect([row, word, p[index]]).toEqual([row, word, expected]);
                }
            }
        });
    }

    for (const [name, stride] of [["vec2", 8], ["tight vec3", 12]] as const) {
        it(`runs whole ${name} elements four rows at a time from any start, then the tail`, () => {
            const leaves = stride / 4;
            const local = (index: number): Expression => ({ kind: "local", local: index });
            // const [p…] = p; const [v…] = v; p = [p + v * args + (leaf + 1), …]; stamp p's ticks.
            const program: Program = {
                locals: 2 * leaves,
                body: [
                    ...Array.from({ length: 2 * leaves }, (_, index): Program.Statement => ({ kind: "set", local: index, value: read(index) })),
                    ...Array.from({ length: leaves }, (_, leaf): Program.Statement => ({
                        kind: "store",
                        column: leaf,
                        value: add(add(local(leaf), { kind: "binary", operator: "*", left: local(leaves + leaf), right: { kind: "args", path: [] } }), { kind: "number", value: leaf + 1 }),
                    })),
                    { kind: "stamp", column: 2 * leaves, chunks: 2 * leaves + 1, blocks: 2 * leaves + 2 },
                ],
            };
            const columns: WasmColumn[] = [
                ...Array.from({ length: leaves }, (_, leaf) => column(0, stride, 4 * leaf)),
                ...Array.from({ length: leaves }, (_, leaf) => column(1, stride, 4 * leaf)),
                { view: "f64", stride: 8, offset: 0, boolean: false, component: -1 },
                { view: "f64", stride: 8, offset: 0, boolean: false, component: -2 },
                { view: "f64", stride: 8, offset: 0, boolean: false, component: -3 },
            ];
            const kernel = generateWasm(program, columns, () => "number");
            if (kernel === null) throw new Error("expected a kernel");
            expect(kernel.vectorized).toBe(true);
            const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
            const p = new Float32Array(memory.buffer, 4096, 32 * leaves);
            const v = new Float32Array(memory.buffer, 8192, 32 * leaves);
            const ticks = new Float64Array(memory.buffer, 16384, 32).fill(1);
            for (let i = 0; i < p.length; i++) { p[i] = i; v[i] = 2 * i + 100; }
            const runKernel: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
            if (typeof runKernel !== "function") throw new Error("no run export");
            const [start, end] = [3, 22];
            runKernel(start, end, 7, -1, ...columns.slice(0, leaves).map(() => 4096), ...columns.slice(0, leaves).map(() => 8192), 16384, 20480, 24576, 0.5);
            const row = (index: number): number => Math.floor(index / leaves);
            expect([...p]).toEqual([...p].map((_, i) => row(i) >= start && row(i) < end ? i + (2 * i + 100) * 0.5 + (i % leaves) + 1 : i));
            expect([...ticks]).toEqual([...ticks].map((_, i) => i >= start && i < end ? 7 : 1));
        });
    }

    it("blends stores and tick stamps under an if, per lane", () => {
        const positive: Expression = { kind: "binary", operator: ">", left: read(0), right: { kind: "number", value: 0 } };
        const program: Program = { locals: 0, body: [{ kind: "if", test: positive, consequent: [{ kind: "store", column: 1, value: read(0) }, { kind: "stamp", column: 2, chunks: 3, blocks: 4 }], alternate: [] }] };
        const ticksColumn: WasmColumn = { view: "f64", stride: 8, offset: 0, boolean: false, component: -1 };
        const chunksColumn: WasmColumn = { view: "f64", stride: 8, offset: 0, boolean: false, component: -2 };
        const blocksColumn: WasmColumn = { view: "f64", stride: 8, offset: 0, boolean: false, component: -3 };
        const inputs = [1, -1, 2, -2, 0, 3, NaN, 4, -5, 6];
        const { kernel, floats, ticks, chunks, blocks } = runVector(program, [column(0, 4, 0), column(1, 4, 0), ticksColumn, chunksColumn, blocksColumn], ([input, out], tickValues) => {
            input.set(inputs);
            out.fill(-7);
            tickValues.fill(1);
        }, 10);
        expect(kernel.vectorized).toBe(true);
        expect([...floats[1].subarray(0, 10)]).toEqual(inputs.map(x => x > 0 ? x : -7));
        expect([...ticks.subarray(0, 10)]).toEqual(inputs.map(x => x > 0 ? 7 : 1));
        expect(chunks[0]).toBe(7);
        expect(blocks[0]).toBe(7);
    });

    /** Runs `out = in` with its stamps where `in > 0`, rows `start` to `end` of 2048, four at a time; the blocks then stamped. */
    const stampedFourAtATime = (start: number, end: number, positive: readonly number[]): number[] => {
        const test: Expression = { kind: "binary", operator: ">", left: read(0), right: { kind: "number", value: 0 } };
        const program: Program = { locals: 0, body: [{ kind: "if", test, consequent: [{ kind: "store", column: 1, value: read(0) }, { kind: "stamp", column: 2, chunks: 3, blocks: 4 }], alternate: [] }] };
        const dense = (component: number): WasmColumn => ({ view: "f64", stride: 8, offset: 0, boolean: false, component });
        const kernel = generateWasm(program, [column(0, 4, 0), column(1, 4, 0), dense(-1), dense(-2), dense(-3)], () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        expect(kernel.vectorized).toBe(true);
        const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536, shared: true });
        const input = new Float32Array(memory.buffer, 0, 2048).fill(-1);
        for (const row of positive) input[row] = 1;
        const blocks = new Float64Array(memory.buffer, 65536 + 1024, 32);
        const runKernel = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(start, end, 7, -1, 0, 8192, 16384, 65536, 65536 + 1024);
        return [...blocks].flatMap((tick, block) => tick === 7 ? [block] : []);
    };

    it("stamps the blocks of rows a conditional write reaches four rows at a time", () => {
        // 300 rows are 75 whole groups, so no row runs one at a time.
        expect(stampedFourAtATime(0, 300, [200])).toContain(200 >> 6);
        // From row 1 the last group, rows 61 to 64, straddles blocks 0 and 1, and only its last row writes.
        expect(stampedFourAtATime(1, 65, [64])).toEqual([0, 1]);
    });

    it("stays scalar for operations without an exact f32x4 equivalent", () => {
        const remainder: Expression = { kind: "binary", operator: "%", left: read(0), right: { kind: "number", value: 2 } };
        const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value: remainder }] }, [column(0, 4, 0), column(1, 4, 0)], () => "number");
        expect(kernel?.vectorized).toBe(false);
    });
});

describe("generateWasm with change filters", () => {
    it("runs only rows with a newer tick, skipping chunks and blocks whose tick isn't newer", () => {
        for (const simd of [false, true]) {
            // out = in, for rows whose filter tick is newer than lastRun 5.
            const columns: WasmColumn[] = [{ view: "f32", stride: 4, offset: 0, boolean: false, component: 0 }, { view: "f32", stride: 4, offset: 0, boolean: false, component: 1 }];
            const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value: { kind: "column", column: 0 } }] }, columns, () => "number", simd, 1);
            if (kernel === null) throw new Error("expected a kernel");
            const rows = 2100;
            const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
            const input = new Float32Array(memory.buffer, 0, rows);
            for (let row = 0; row < rows; row++) input[row] = row;
            const output = new Float32Array(memory.buffer, 16384, rows).fill(-1);
            const ticks = new Float64Array(memory.buffer, 32768, rows);
            const chunks = new Float64Array(memory.buffer, 65536, 3);
            const blocks = new Float64Array(memory.buffer, 66560, 48);
            // Chunk 0's chunk and block ticks are stale-new (8) but its rows are old; chunk 1 has three new rows in
            // blocks marked new; chunk 2 is old throughout.
            chunks.set([8, 9, 3]);
            blocks.fill(8, 0, 16).fill(3, 16);
            for (const row of [1030, 1500, 2047]) {
                ticks[row] = 9;
                blocks[row >> 6] = 9;
            }
            ticks[1100] = 9;
            ticks[2050] = 9;
            const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
            if (typeof run !== "function") throw new Error("no run export");
            run(0, rows, 10, 5, 0, 16384, 32768, 65536, 66560);
            const written = [...output].flatMap((value, row) => value === -1 ? [] : [row]);
            // Rows 1100 and 2050 have new ticks, but their block or chunk says nothing in it changed, so they're skipped by design.
            expect([simd, kernel.vectorized, written]).toEqual([simd, false, [1030, 1500, 2047]]);
            // From a start inside a block, that block's tick is still checked.
            output.fill(-1);
            run(1029, 1040, 10, 5, 0, 16384, 32768, 65536, 66560);
            expect([...output].flatMap((value, row) => value === -1 ? [] : [row])).toEqual([1030]);
            // lastRun below 0 passes everything.
            output.fill(-1);
            run(0, rows, 10, -1, 0, 16384, 32768, 65536, 66560);
            expect(output.every((value, row) => value === row)).toBe(true);
        }
    });
});

describe("generateWasm with up", () => {
    it("refuses change filters, which its runner applies by listing only passing rows", () => {
        const columns: WasmColumn[] = [{ view: "f32", stride: 4, offset: 0, boolean: false, component: 0 }];
        const program: Program = { locals: 0, up: true, body: [{ kind: "store", column: 0, value: { kind: "number", value: 1 } }] };
        expect(() => generateWasm(program, columns, () => "number", true, 1)).toThrow("takes no change filters");
        expect(generateWasm(program, columns, () => "number", true, 0)).not.toBeNull();
    });
});

describe("generateWasm with several change filters", () => {
    it("runs rows either filter passes, a chunk with most blocks passing as one run", () => {
        for (const simd of [false, true]) {
            const columns: WasmColumn[] = [{ view: "f32", stride: 4, offset: 0, boolean: false, component: 0 }, { view: "f32", stride: 4, offset: 0, boolean: false, component: 1 }];
            const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value: { kind: "column", column: 0 } }] }, columns, () => "number", simd, 2);
            if (kernel === null) throw new Error("expected a kernel");
            const rows = 2100;
            const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
            const input = new Float32Array(memory.buffer, 0, rows);
            for (let row = 0; row < rows; row++) input[row] = row;
            const output = new Float32Array(memory.buffer, 16384, rows).fill(-1);
            // Each filter's rows, chunks and blocks.
            const ticks = [new Float64Array(memory.buffer, 32768, rows).fill(1), new Float64Array(memory.buffer, 65536 + 4096, rows).fill(1)];
            const chunks = [new Float64Array(memory.buffer, 65536, 3).fill(1), new Float64Array(memory.buffer, 65536 + 64, 3).fill(1)];
            const blocks = [new Float64Array(memory.buffer, 65536 + 1024, 48).fill(1), new Float64Array(memory.buffer, 65536 + 2048, 48).fill(1)];
            const mark = (filter: number, row: number): void => {
                ticks[filter][row] = chunks[filter][row >> 10] = blocks[filter][row >> 6] = 9;
            };
            // Chunk 0: the first filter marks ten blocks of sixteen, so the chunk runs whole, and a row in an
            // unmarked block with a new tick runs too. Chunk 1: each filter marks a row; a new tick in an unmarked
            // block is skipped.
            for (let block = 0; block < 10; block++) mark(0, block * 64 + 1);
            ticks[1][900] = 9;
            chunks[1][0] = 9;
            mark(0, 1030);
            mark(1, 1500);
            ticks[1][1700] = 9;
            const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
            if (typeof run !== "function") throw new Error("no run export");
            run(0, rows, 10, 5, 0, 16384, 32768, 65536 + 4096, 65536, 65536 + 64, 65536 + 1024, 65536 + 2048);
            const written = [...output].flatMap((value, row) => value === -1 ? [] : [row]);
            expect([simd, written]).toEqual([simd, [...Array.from({ length: 10 }, (_, block) => block * 64 + 1), 900, 1030, 1500]]);
        }
    });
});

describe("generateWasm chunk and block stamps", () => {
    const columns: WasmColumn[] = [
        { view: "f32", stride: 4, offset: 0, boolean: false, component: 0 },
        { view: "f64", stride: 8, offset: 0, boolean: false, component: -1 },
        { view: "f64", stride: 8, offset: 0, boolean: false, component: -2 },
        { view: "f64", stride: 8, offset: 0, boolean: false, component: -3 },
    ];
    /** The blocks whose tick is 7. */
    const stampedBlocks = (blocks: Float64Array): number[] => [...blocks].flatMap((tick, block) => tick === 7 ? [block] : []);
    const run = (program: Program, start: number, end: number): { readonly chunks: number[]; readonly blocks: number[] } => {
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
        new Float32Array(memory.buffer, 0, 4096).fill(1);
        const chunks = new Float64Array(memory.buffer, 65536, 4);
        const blocks = new Float64Array(memory.buffer, 66560, 64);
        const runKernel = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(start, end, 7, -1, 0, 32768, 65536, 66560);
        return { chunks: [...chunks], blocks: stampedBlocks(blocks) };
    };
    const stamp: Program.Statement = { kind: "stamp", column: 1, chunks: 2, blocks: 3 };
    const range = (first: number, last: number): number[] => Array.from({ length: last - first + 1 }, (_, k) => first + k);

    it("stamps every chunk and block of the range once when every row stamps", () => {
        expect(run({ locals: 0, body: [stamp] }, 1000, 2100)).toEqual({ chunks: [7, 7, 7, 0], blocks: range(1000 >> 6, 2099 >> 6) });
        expect(run({ locals: 0, body: [stamp] }, 5, 5)).toEqual({ chunks: [0, 0, 0, 0], blocks: [] });
    });

    it("stamps per row when a row can end before its stamp", () => {
        // Rows of chunk 1 end early, so only chunks 0 and 2 are stamped.
        const skipWhereTwo: Program.Statement = {
            kind: "if",
            test: { kind: "binary", operator: "==", left: { kind: "column", column: 0 }, right: { kind: "number", value: 2 } },
            consequent: [{ kind: "next" }],
            alternate: [],
        };
        const body: Program.Statement[] = [skipWhereTwo, stamp];
        const kernel = generateWasm({ locals: 0, body }, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
        const values = new Float32Array(memory.buffer, 0, 4096).fill(1);
        values.fill(2, 1024, 2048);
        const chunks = new Float64Array(memory.buffer, 65536, 4);
        const blocks = new Float64Array(memory.buffer, 66560, 64);
        const runKernel = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof runKernel !== "function") throw new Error("no run export");
        runKernel(0, 3000, 7, -1, 0, 32768, 65536, 66560);
        expect([...chunks]).toEqual([7, 0, 7, 0]);
        expect(stampedBlocks(blocks)).toEqual([...range(0, 15), ...range(32, 2999 >> 6)]);
    });
});

describe("generateWasm integer remainder", () => {
    it("matches JS % for integers, including -0, with or without the import", () => {
        const values = [0, 7, -7, 10, -10, 2147483647, -2147483648, 4294967295, 123456];
        for (const view of ["i32", "u32"] as const) {
            for (const divisor of [3, -3, 1, 10, 1000]) {
                const columns: WasmColumn[] = [{ view, stride: 4, offset: 0, boolean: false, component: 0 }, { view: "f64", stride: 8, offset: 0, boolean: false, component: 1 }];
                const remainder: Expression = { kind: "binary", operator: "%", left: { kind: "column", column: 0 }, right: { kind: "number", value: divisor } };
                const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value: remainder }] }, columns, () => "number");
                if (kernel === null) throw new Error("expected a kernel");
                expect(kernel.imports).toEqual([]);
                const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
                const input = view === "i32" ? new Int32Array(memory.buffer, 0, values.length) : new Uint32Array(memory.buffer, 0, values.length);
                input.set(values);
                const output = new Float64Array(memory.buffer, 4096, values.length);
                const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
                if (typeof run !== "function") throw new Error("no run export");
                run(0, values.length, 0, -1, 0, 4096);
                expect([view, divisor, [...output]]).toEqual([view, divisor, [...input].map(x => x % divisor)]);
            }
        }
    });
});

describe("generateWasm reductions", () => {
    it("start each accumulator at its partial, fold every row into it, and store it back", () => {
        // Local 0 sums the input and local 1 takes its least, from partials 10 and 5.
        const program: Program = {
            locals: 2,
            reductions: [0, 1],
            body: [
                { kind: "set", local: 0, value: { kind: "binary", operator: "+", left: { kind: "local", local: 0 }, right: input } },
                { kind: "set", local: 1, value: { kind: "math", name: "min", arguments: [{ kind: "local", local: 1 }, input] } },
            ],
        };
        for (const simd of [false, true]) {
            const kernel = generateWasm(program, [dense("f64", 0)], () => "number", simd);
            if (kernel === null) throw new Error("expected a kernel");
            const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
            new Float64Array(memory.buffer, 0, 9).set([3, -2, 7, 1, 8, 0.5, 4, 6, 2]);
            const partials = new Float64Array(memory.buffer, 4096, 2);
            partials.set([10, 5]);
            const instance = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) });
            const runKernel: unknown = instance.exports.run;
            if (typeof runKernel !== "function") throw new Error("no run export");
            runKernel(0, 9, 0, -1, 0, 4096);
            expect([...partials]).toEqual([10 + 29.5, -2]);
            expect(kernel.vectorized).toBe(false);
        }
    });
});

describe("generateWasm with f64 lanes, as kernels computing at the body's precision run", () => {
    const column = (component: number, stride: number, offset: number): WasmColumn => ({ view: "f32", stride, offset, boolean: false, component });
    const ticks = (component: number): WasmColumn => ({ view: "f64", stride: 8, offset: 0, boolean: false, component });
    const read = (k: number): Expression => ({ kind: "column", column: k });
    const number = (value: number): Expression => ({ kind: "number", value });
    const binary = (operator: "+" | "-" | "*" | "/" | ">" | "<=", left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
    const math = (name: string, ...parameters: Expression[]): Expression => ({ kind: "math", name, arguments: parameters });

    /**
     * Runs `program` over rows `start` to `end` with f64 lanes, and as scalar WASM, which is JS's semantics; returns
     * whether the lanes ran, and each run's memory as bits, so NaN and -0 compare exactly.
     */
    const both = (program: Program, columns: readonly WasmColumn[], fill: (floats: readonly Float32Array[]) => void, start: number, end: number) => {
        const results = [true, false].map(simd => {
            const kernel = generateWasm(program, columns, () => "number", simd, 0, [], [], [], [], [], false);
            if (kernel === null) throw new Error("expected a kernel");
            const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
            // f32 components at 4096 × (component + 1); ticks, then their chunks, then their blocks, after them.
            const baseOf = (info: WasmColumn): number => info.view === "f64" ? 4096 * (8 - info.component) : 4096 * (info.component + 1);
            const floats = [0, 1, 2].map(component => new Float32Array(memory.buffer, 4096 * (component + 1), 1024));
            new Float64Array(memory.buffer, 4096 * 9, 1536).fill(1);
            fill(floats);
            const run: unknown = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
            if (typeof run !== "function") throw new Error("no run export");
            run(start, end, 7, -1, ...columns.map(baseOf), 0.75);
            return { vectorized: kernel.vectorized, bits: [...new Uint32Array(memory.buffer, 4096, 4096 * 3)] };
        });
        return { vectorized: results[0].vectorized, same: results[0].bits.every((bits, i) => bits === results[1].bits[i]) };
    };
    /** Values where f32 arithmetic loses what f64 keeps: cancellation, rounding at each step, NaN, infinities and -0. */
    const hard = (i: number): number => [1 + 2 ** -23, 1 + 2 ** -22, 3.4e38, -0, NaN, Infinity, 1e-45, 0.1, -7.25, 16777217][i % 10] * (1 + (i % 7) * 2 ** -20);

    it("computes dense f32 columns two rows at a time in f64, as the body does, through the tail", () => {
        // out = a * a - b, which cancels in f32; and out2 = sqrt(|a|) / b + min(a, args) * fround(b) - floor(a).
        const program: Program = {
            locals: 0,
            body: [
                { kind: "store", column: 2, value: binary("-", binary("*", read(0), read(0)), read(1)) },
                { kind: "store", column: 3, value: binary("-", binary("+", binary("/", math("sqrt", math("abs", read(0))), read(1)), binary("*", math("min", read(0), { kind: "args", path: [] }), math("fround", read(1)))), math("floor", read(0))) },
            ],
        };
        const columns = [column(0, 4, 0), column(1, 4, 0), column(2, 4, 0), column(2, 4, 2048)];
        for (const [start, end] of [[0, 300], [3, 22], [1, 2]] as const) {
            expect([start, end, both(program, columns, ([a, b]) => { for (let i = 0; i < 1024; i++) { a[i] = hard(i); b[i] = hard(i + 1); } }, start, end)]).toEqual([start, end, { vectorized: true, same: true }]);
        }
    });

    it("blends stores and stamps under an if per lane, in f64", () => {
        const program: Program = {
            locals: 1,
            body: [
                { kind: "set", local: 0, value: binary("*", read(0), read(0)) },
                { kind: "if", test: binary(">", { kind: "local", local: 0 }, read(1)), consequent: [{ kind: "store", column: 2, value: binary("-", { kind: "local", local: 0 }, read(1)) }, { kind: "stamp", column: 3, chunks: 4, blocks: 5 }], alternate: [{ kind: "store", column: 2, value: { kind: "conditional", test: binary("<=", read(0), number(0)), consequent: number(-1), alternate: read(1) } }] },
            ],
        };
        const columns = [column(0, 4, 0), column(1, 4, 0), column(2, 4, 0), ticks(-1), ticks(-2), ticks(-3)];
        expect(both(program, columns, ([a, b]) => { for (let i = 0; i < 1024; i++) { a[i] = hard(i); b[i] = hard(i + 3); } }, 5, 133)).toEqual({ vectorized: true, same: true });
    });

    // A padded vec3's elements aren't whole vectors, and f64 lanes don't fuse within a row, so it runs a row at a time.
    for (const [name, stride, leaves, vectorized] of [["vec2", 8, 2, true], ["tight vec3", 12, 3, true], ["padded vec3", 16, 3, false]] as const) {
        it(`computes ${name} elements ${vectorized ? "in f64 lanes" : "a row at a time"}, as the body does`, () => {
            // p = p * v - v * args, leaf by leaf, with p.x and v.x reading cancelling values.
            const all = Array.from({ length: leaves }, (_, leaf) => leaf);
            const program: Program = { locals: 0, body: all.map(leaf => ({ kind: "store", column: leaf, value: binary("-", binary("*", read(leaf), read(leaves + leaf)), binary("*", read(leaves + leaf), { kind: "args", path: [] })) })) };
            const columns = [...all.map(leaf => column(0, stride, 4 * leaf)), ...all.map(leaf => column(1, stride, 4 * leaf))];
            expect(both(program, columns, ([p, v]) => { for (let i = 0; i < 1024; i++) { p[i] = hard(i); v[i] = hard(i + 1); } }, 1, 63)).toEqual({ vectorized, same: true });
        });
    }

    it("leaves explicit kernels' f32 lanes, which round each step", () => {
        const program: Program = { locals: 0, body: [{ kind: "store", column: 2, value: binary("-", binary("*", read(0), read(0)), read(1)) }] };
        const columns = [column(0, 4, 0), column(1, 4, 0), column(2, 4, 0)];
        const kernel = generateWasm(program, columns, () => "number", true, 0, [], [], [], [], [], true);
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Float32Array(memory.buffer, 4096, 4).fill(1 + 2 ** -23);
        new Float32Array(memory.buffer, 8192, 4).fill(1 + 2 ** -22);
        const run: unknown = kernel === null ? null : new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, 4, 7, -1, 4096, 8192, 12288);
        expect([kernel?.vectorized, new Float32Array(memory.buffer, 12288, 1)[0]]).toEqual([true, 0]);
    });
});

describe("generateWasm integer operations", () => {
    const local = (index: number): Expression => ({ kind: "local", local: index });
    const column = (index: number): Expression => ({ kind: "column", column: index });
    const number = (value: number): Expression => ({ kind: "number", value });
    const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
    const imul = (left: Expression, right: Expression): Expression => ({ kind: "math", name: "imul", arguments: [left, right] });
    const rotate = (value: Expression, bits: number): Expression => binary("|", binary("<<", value, number(bits)), binary(">>>", value, number(32 - bits)));

    /** A step of xoshiro128** over u32 columns 0 to 3, into columns 4 to 7, its output into column 8. */
    const xoshiro: Program = {
        locals: 5,
        body: [
            { kind: "set", local: 0, value: imul(column(1), number(5)) },
            { kind: "store", column: 8, value: binary(">>>", imul(rotate(local(0), 7), number(9)), number(0)) },
            { kind: "set", local: 1, value: binary("<<", column(1), number(9)) },
            { kind: "set", local: 2, value: binary("^", column(2), column(0)) },
            { kind: "set", local: 3, value: binary("^", column(3), column(1)) },
            { kind: "set", local: 4, value: binary("^", column(1), local(2)) },
            { kind: "store", column: 4, value: binary(">>>", binary("^", column(0), local(3)), number(0)) },
            { kind: "store", column: 5, value: binary(">>>", local(4), number(0)) },
            { kind: "store", column: 6, value: binary(">>>", binary("^", local(2), local(1)), number(0)) },
            { kind: "store", column: 7, value: binary(">>>", rotate(local(3), 11), number(0)) },
        ],
    };
    const jsStep = ([s0, s1, s2, s3]: readonly number[]): number[] => {
        const scrambled = Math.imul(s1, 5);
        const value = Math.imul((scrambled << 7) | (scrambled >>> 25), 9) >>> 0;
        const t = s1 << 9, t2 = s2 ^ s0, t3 = s3 ^ s1;
        return [(s0 ^ t3) >>> 0, (s1 ^ t2) >>> 0, (t2 ^ t) >>> 0, ((t3 << 11) | (t3 >>> 21)) >>> 0, value];
    };
    const states = [[0, 0, 0, 0], [1, 2, 3, 4], [0xFFFFFFFF, 0x80000000, 0x7FFFFFFF, 1], [340383, 2654435769, 123456789, 987654321]];
    const word = (component: number): WasmColumn => ({ view: "u32", stride: 4, offset: 0, boolean: false, component });

    const runXoshiro = (kernel: { readonly bytes: Uint8Array; readonly imports: readonly string[] }): number[][] => {
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const words = Array.from({ length: 9 }, (_, k) => new Uint32Array(memory.buffer, 512 * k, states.length));
        states.forEach((state, row) => state.forEach((value, k) => { words[k][row] = value; }));
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, states.length, 0, -1, ...words.map((_, k) => 512 * k));
        return states.map((_, row) => [4, 5, 6, 7, 8].map(k => words[k][row]));
    };

    it("computes a xoshiro128** step as JS does", () => {
        const kernel = generateWasm(xoshiro, Array.from({ length: 9 }, (_, k) => word(k)), () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        expect(runXoshiro(kernel)).toEqual(states.map(jsStep));
    });

    it("keeps integers in i32 between integer operations, never reducing them through f64", () => {
        const kernel = generateWasm(xoshiro, Array.from({ length: 9 }, (_, k) => word(k)), () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        // ToInt32 of an f64 that may be any number scales it by 2^-32 first.
        const scale = [0x44, ...new Uint8Array(new Float64Array([2 ** -32]).buffer)];
        const bytes = [...kernel.bytes];
        expect(bytes.some((_, at) => scale.every((byte, k) => bytes[at + k] === byte))).toBe(false);
    });

    it("converts integer locals and operations to numbers exactly where they're read as numbers", () => {
        const program: Program = {
            locals: 2,
            body: [
                { kind: "set", local: 0, value: binary(">>>", column(0), number(0)) },
                { kind: "set", local: 1, value: binary("|", column(0), number(0)) },
                { kind: "store", column: 1, value: binary("+", local(0), binary("*", local(1), number(0.5))) },
            ],
        };
        const values = [0, -1, 2 ** 31, -(2 ** 31), 2 ** 32 - 1, 3.7, -3.7, 2 ** 53, NaN, Infinity];
        const columns: WasmColumn[] = [{ view: "f64", stride: 8, offset: 0, boolean: false, component: 0 }, { view: "f64", stride: 8, offset: 0, boolean: false, component: 1 }];
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Float64Array(memory.buffer, 0, values.length).set(values);
        const output = new Float64Array(memory.buffer, 4096, values.length);
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, values.length, 0, -1, 0, 4096);
        expect([...output]).toEqual(values.map(x => (x >>> 0) + (x | 0) * 0.5));
    });
});

describe("generateWasm integer remainders of sums", () => {
    it("matches JS for a counter stepped and wrapped, stored as an integer, without the imported remainder", () => {
        const counter: Expression = { kind: "binary", operator: "%", left: { kind: "binary", operator: "+", left: { kind: "column", column: 0 }, right: { kind: "number", value: 1 } }, right: { kind: "number", value: 1000000 } };
        const negated: Expression = { kind: "binary", operator: "%", left: { kind: "unary", operator: "-", operand: { kind: "column", column: 0 } }, right: { kind: "number", value: 7 } };
        const values = [0, 1, 999999, -1, -1000000, 2147483647, -2147483648];
        for (const [value, expected] of [[counter, (x: number) => (x + 1) % 1000000], [negated, (x: number) => -x % 7]] as const) {
            for (const output of ["i32", "f64"] as const) {
                const columns: WasmColumn[] = [{ view: "i32", stride: 4, offset: 0, boolean: false, component: 0 }, dense(output, 1)];
                const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value }] }, columns, () => "number");
                if (kernel === null) throw new Error("expected a kernel");
                expect(kernel.imports).toEqual([]);
                const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
                new Int32Array(memory.buffer, 0, values.length).set(values);
                const result = new views[output](memory.buffer, 4096, values.length);
                const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
                if (typeof run !== "function") throw new Error("no run export");
                run(0, values.length, 0, -1, 0, 4096);
                expect([output, [...result]]).toEqual([output, viaTypedArray(output, values.map(expected))]);
            }
        }
    });
});

describe("generateWasm branch-free conditionals", () => {
    const column = (index: number): Expression => ({ kind: "column", column: index });
    const number = (value: number): Expression => ({ kind: "number", value });
    const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
    /** Fields of one component, 16 bytes a row: hp and maxhp (i32), status (u32), alive (boolean u8). */
    const fields: WasmColumn[] = [
        { view: "i32", stride: 16, offset: 0, boolean: false, component: 0 },
        { view: "i32", stride: 16, offset: 4, boolean: false, component: 0 },
        { view: "u32", stride: 16, offset: 8, boolean: false, component: 0 },
        { view: "u8", stride: 16, offset: 12, boolean: true, component: 0 },
        { view: "f32", stride: 4, offset: 0, boolean: false, component: 1 },
    ];
    const [hp, maxhp, status, alive, damage] = [0, 1, 2, 3, 4].map(column);
    /** HealthSystem's chain, then a damage step under `&&`, and a ternary of constants. */
    const program: Program = {
        locals: 0,
        body: [
            {
                kind: "if", test: binary("<=", hp, number(0)),
                consequent: [{ kind: "store", column: 2, value: number(2) }, { kind: "store", column: 3, value: { kind: "boolean", value: false } }],
                alternate: [{
                    kind: "if", test: binary(">=", hp, maxhp),
                    consequent: [{ kind: "store", column: 0, value: maxhp }, { kind: "store", column: 2, value: number(1) }],
                    alternate: [{ kind: "store", column: 2, value: number(3) }],
                }],
            },
            {
                kind: "if", test: { kind: "logical", operator: "&&", left: binary(">", hp, number(0)), right: binary(">", damage, number(0)) },
                consequent: [{ kind: "store", column: 0, value: { kind: "math", name: "max", arguments: [binary("-", hp, damage), number(0)] } }, { kind: "store", column: 4, value: binary("*", damage, number(0.5)) }],
                alternate: [],
            },
            { kind: "store", column: 1, value: { kind: "conditional", test: alive, consequent: binary("+", maxhp, number(1)), alternate: maxhp } },
        ],
    };
    type Row = { hp: number; maxhp: number; status: number; alive: boolean; damage: number };
    const reference = (row: Row): Row => {
        const next = { ...row };
        if (next.hp <= 0) { next.status = 2; next.alive = false; }
        else if (next.hp >= next.maxhp) { next.hp = next.maxhp; next.status = 1; }
        else next.status = 3;
        if (next.hp > 0 && next.damage > 0) { next.hp = Math.max(next.hp - next.damage, 0) | 0; next.damage = Math.fround(next.damage * 0.5); }
        next.maxhp = (next.alive ? next.maxhp + 1 : next.maxhp) | 0;
        return next;
    };

    it("stores what the branches would, row by row, for every combination of predicates", () => {
        const kernel = generateWasm(program, fields, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        expect(kernel.imports).toEqual([]);
        const rows: Row[] = [];
        for (const hpValue of [-5, 0, 3, 10, 12]) for (const damageValue of [-1, 0, 2.5, 20]) for (const aliveValue of [false, true]) rows.push({ hp: hpValue, maxhp: 10, status: 0, alive: aliveValue, damage: damageValue });
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const words = new Int32Array(memory.buffer, 0, rows.length * 4);
        const bytes = new Uint8Array(memory.buffer, 0, rows.length * 16);
        const damages = new Float32Array(memory.buffer, 8192, rows.length);
        rows.forEach((row, k) => { words[4 * k] = row.hp; words[4 * k + 1] = row.maxhp; words[4 * k + 2] = row.status; bytes[16 * k + 12] = row.alive ? 1 : 0; damages[k] = row.damage; });
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows.length, 0, -1, 0, 0, 0, 0, 8192);
        const results = rows.map((_, k): Row => ({ hp: words[4 * k], maxhp: words[4 * k + 1], status: words[4 * k + 2], alive: bytes[16 * k + 12] === 1, damage: damages[k] }));
        expect(results).toEqual(rows.map(row => reference({ ...row, damage: Math.fround(row.damage) })));
    });

    it("branches only on a test whose arms hold an if, running the ifs without one branch-free", () => {
        const kernel = generateWasm(program, fields, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect(wat.wat.match(/\bif\b/g)).toHaveLength(1);
        expect(wat.wat.match(/\bselect\b/g)?.length).toBeGreaterThanOrEqual(5);
    });

    it("stamps the row, block and chunk ticks of only the rows whose predicate holds", () => {
        const stamped: Program = {
            locals: 0,
            body: [{
                kind: "if", test: binary(">", column(0), number(0)),
                consequent: [{ kind: "store", column: 0, value: binary("-", column(0), number(1)) }, { kind: "stamp", column: 1, chunks: 2, blocks: 3 }],
                alternate: [],
            }],
        };
        const ticks = (component: number): WasmColumn => ({ view: "f64", stride: 8, offset: 0, boolean: false, component });
        const kernel = generateWasm(stamped, [{ view: "i32", stride: 4, offset: 0, boolean: false, component: 0 }, ticks(-1), ticks(-1), ticks(-1)], () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect(wat.wat).not.toMatch(/\bif\b/);
        const rows = 2 ** blockShift * 3;
        const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
        const values = new Int32Array(memory.buffer, 0, rows);
        // Only rows of the middle block pass.
        values.fill(0);
        values.fill(5, 2 ** blockShift, 2 * 2 ** blockShift);
        const rowTicks = new Float64Array(memory.buffer, 65536, rows).fill(3);
        const chunkTicks = new Float64Array(memory.buffer, 2 * 65536, 4).fill(3);
        const blockTicks = new Float64Array(memory.buffer, 3 * 65536, 4).fill(3);
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows, 9, -1, 0, 65536, 2 * 65536, 3 * 65536);
        expect([...new Set(rowTicks.subarray(0, 2 ** blockShift))]).toEqual([3]);
        expect([...new Set(rowTicks.subarray(2 ** blockShift, 2 * 2 ** blockShift))]).toEqual([9]);
        expect([...blockTicks.subarray(0, 3)]).toEqual([3, 9, 3]);
        expect(chunkTicks[0]).toBe(9);
        expect([...new Set(values.subarray(2 ** blockShift, 2 * 2 ** blockShift))]).toEqual([4]);
    });
});

describe("generateWasm exact integer arithmetic", () => {
    it("stores sums, differences, products and remainders of integers as JS does, at the edges of 32 bits", () => {
        const input: Expression = { kind: "column", column: 0 };
        const number = (value: number): Expression => ({ kind: "number", value });
        const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
        const values = [0, 1, -1, 999999, 2147483647, -2147483648, 123456789];
        const cases: [Expression, (x: number) => number][] = [
            [binary("%", binary("+", input, number(1)), number(1000000)), x => (x + 1) % 1000000],
            [binary("+", input, number(2147483647)), x => x + 2147483647],
            [binary("*", input, number(3)), x => x * 3],
            [binary("-", number(-5), input), x => -5 - x],
            [binary("%", binary("*", input, number(65536)), number(7)), x => (x * 65536) % 7],
            [binary("%", binary("+", input, number(2 ** 40)), number(1000)), x => (x + 2 ** 40) % 1000],
        ];
        for (const [value, expected] of cases) {
            for (const output of ["i32", "u32"] as const) {
                const columns: WasmColumn[] = [{ view: "i32", stride: 4, offset: 0, boolean: false, component: 0 }, dense(output, 1)];
                const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value }] }, columns, () => "number");
                if (kernel === null) throw new Error("expected a kernel");
                expect(kernel.imports).toEqual([]);
                const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
                new Int32Array(memory.buffer, 0, values.length).set(values);
                const result = new views[output](memory.buffer, 4096, values.length);
                const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
                if (typeof run !== "function") throw new Error("no run export");
                run(0, values.length, 0, -1, 0, 4096);
                expect([output, [...result]]).toEqual([output, viaTypedArray(output, values.map(expected))]);
            }
        }
    });
});

describe("generateWasm integer comparisons and remainders", () => {
    it("tests and stores remainders of i32 and u32 columns as JS does, -0 included", () => {
        const number = (value: number): Expression => ({ kind: "number", value });
        const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
        const values = [0, 1, -1, -10, 10, 2147483647, -2147483648, 17, 4294967295, 123456789];
        for (const view of ["i32", "u32"] as const) {
            const column: Expression = { kind: "column", column: 0 };
            const cases: [Expression, (x: number) => number][] = [
                [{ kind: "conditional", test: binary("===", binary("%", column, number(10)), number(0)), consequent: number(1), alternate: number(2) }, x => x % 10 === 0 ? 1 : 2],
                [{ kind: "conditional", test: binary("<", binary("%", column, number(10)), number(-3)), consequent: number(1), alternate: number(2) }, x => x % 10 < -3 ? 1 : 2],
                [binary("/", number(1), binary("%", column, number(17))), x => 1 / (x % 17)],
                [binary("+", binary("%", column, number(17)), number(3)), x => (x % 17) + 3],
            ];
            for (const [value, expected] of cases) {
                const columns: WasmColumn[] = [{ view, stride: 4, offset: 0, boolean: false, component: 0 }, dense("f64", 1)];
                const kernel = generateWasm({ locals: 0, body: [{ kind: "store", column: 1, value }] }, columns, () => "number");
                if (kernel === null) throw new Error("expected a kernel");
                const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
                const input = view === "i32" ? new Int32Array(memory.buffer, 0, values.length) : new Uint32Array(memory.buffer, 0, values.length);
                input.set(values);
                const result = new Float64Array(memory.buffer, 4096, values.length);
                const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
                if (typeof run !== "function") throw new Error("no run export");
                run(0, values.length, 0, -1, 0, 4096);
                expect([view, [...result]]).toEqual([view, [...input].map(expected)]);
            }
        }
    });
});

describe("generateWasm integers through locals", () => {
    const local = (index: number): Expression => ({ kind: "local", local: index });
    const column = (index: number): Expression => ({ kind: "column", column: index });
    const number = (value: number): Expression => ({ kind: "number", value });
    const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });
    const math = (name: "min" | "max", ...parameters: Expression[]): Expression => ({ kind: "math", name, arguments: parameters });
    const choose = (test: Expression, consequent: Expression, alternate: Expression): Expression => ({ kind: "conditional", test, consequent, alternate });

    /** From i32 columns 0 to 2 and u32 column 3: a difference held in a local, its uses, and compares across signedness. */
    const program: Program = {
        locals: 2,
        body: [
            { kind: "set", local: 0, value: binary("-", column(1), column(2)) },
            { kind: "set", local: 1, value: binary("-", column(0), local(0)) },
            { kind: "store", column: 4, value: choose({ kind: "logical", operator: "&&", left: binary(">", column(0), number(0)), right: binary(">", local(0), number(0)) }, math("max", local(1), number(0)), column(0)) },
            { kind: "store", column: 5, value: choose(binary(">", column(3), column(0)), number(1), number(2)) },
            { kind: "store", column: 6, value: choose(binary("===", column(3), number(4294967295)), number(1), choose(binary("<=", column(3), number(2)), number(2), number(3))) },
            { kind: "store", column: 7, value: math("min", column(0), column(1), { kind: "unary", operator: "-", operand: local(0) }) },
            { kind: "store", column: 8, value: local(1) },
        ],
    };
    const reference = ([hp, atk, def, status]: readonly number[]): number[] => {
        const total = atk - def;
        const value = hp - total;
        return [hp > 0 && total > 0 ? Math.max(value, 0) : hp, status > hp ? 1 : 2, status === 4294967295 ? 1 : status <= 2 ? 2 : 3, Math.min(hp, atk, -total), value];
    };
    const edges = [0, 1, -1, 2, 2147483647, -2147483648, 1000];
    const rows = edges.flatMap(hp => edges.flatMap(atk => edges.map(def => [hp, atk, def, [0, 2, 3, 2147483648, 4294967295][(hp + atk + def) & 3 & 0xff] ?? 0])));
    const views8 = ["i32", "i32", "i32", "u32", "i32", "f64", "f64", "i32", "f64"] as const;
    const columns: WasmColumn[] = views8.map((view, component): WasmColumn => ({ view, stride: view === "f64" ? 8 : 4, offset: 0, boolean: false, component }));

    it("compute as JS does at the edges of 32 bits, stored as typed arrays convert", () => {
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 4, maximum: 65536, shared: true });
        const size = 8 * rows.length;
        const arrays = views8.map((view, k) => new views[view](memory.buffer, size * k, rows.length));
        rows.forEach((row, r) => row.forEach((value, k) => { arrays[k][r] = value; }));
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows.length, 0, -1, ...views8.map((_, k) => size * k));
        const stored = rows.map((_, r) => [4, 5, 6, 7, 8].map(k => arrays[k][r]));
        expect(stored).toEqual(rows.map(row => reference(row).map((value, k) => viaTypedArray(views8[4 + k], [value])[0])));
    });

    it("keep -0 where a local may hold it, as a negation, product or remainder of integers gives", () => {
        const signs: Program = {
            locals: 3,
            body: [
                { kind: "set", local: 0, value: { kind: "unary", operator: "-", operand: column(0) } },
                { kind: "set", local: 1, value: binary("*", column(0), number(-3)) },
                { kind: "set", local: 2, value: binary("%", column(0), number(5)) },
                { kind: "store", column: 1, value: binary("/", number(1), local(0)) },
                { kind: "store", column: 2, value: binary("/", number(1), local(1)) },
                { kind: "store", column: 3, value: binary("/", number(1), local(2)) },
            ],
        };
        const signColumns: WasmColumn[] = [{ view: "i32", stride: 4, offset: 0, boolean: false, component: 0 }, ...[1, 2, 3].map(component => dense("f64", component))];
        const kernel = generateWasm(signs, signColumns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const values = [0, -5, 5, -10, 7];
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Int32Array(memory.buffer, 0, values.length).set(values);
        const results = [1, 2, 3].map(k => new Float64Array(memory.buffer, 1024 * k, values.length));
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, values.length, 0, -1, 0, 1024, 2048, 3072);
        expect(results.map(result => [...result])).toEqual([(x: number) => 1 / -x, (x: number) => 1 / (x * -3), (x: number) => 1 / (x % 5)].map(f => values.map(f)));
    });

    it("hold in i64 a local only ever given an integer from +0 up, as an unsigned remainder is", () => {
        const range: Program = {
            locals: 1,
            body: [
                { kind: "set", local: 0, value: binary("%", column(0), number(17)) },
                { kind: "store", column: 1, value: binary("-", local(0), number(10)) },
                { kind: "store", column: 2, value: binary("/", number(1), local(0)) },
            ],
        };
        const rangeColumns: WasmColumn[] = [{ view: "u32", stride: 4, offset: 0, boolean: false, component: 0 }, { view: "i32", stride: 4, offset: 0, boolean: false, component: 1 }, dense("f64", 2)];
        const kernel = generateWasm(range, rangeColumns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const values = [0, 16, 17, 4294967295, 2147483648];
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        new Uint32Array(memory.buffer, 0, values.length).set(values);
        const differences = new Int32Array(memory.buffer, 1024, values.length);
        const inverses = new Float64Array(memory.buffer, 2048, values.length);
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, values.length, 0, -1, 0, 1024, 2048);
        expect([[...differences], [...inverses]]).toEqual([values.map(x => (x % 17) - 10), values.map(x => 1 / (x % 17))]);
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect(wat.wat).toMatch(/\(local i64\)/);
    });

    it("keep integer operations and comparisons off f64, converting only what's stored as f64", () => {
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect(wat.wat).not.toMatch(/f64\.(eq|ne|lt|gt|le|ge|min|max|sub|trunc)\b/);
        expect(wat.wat.match(/f64\.convert/g) ?? []).toHaveLength(1);
    });
});

describe("generateWasm boolean locals", () => {
    const local = (index: number): Expression => ({ kind: "local", local: index });
    const column = (index: number): Expression => ({ kind: "column", column: index });
    const program: Program = {
        locals: 2,
        body: [
            { kind: "set", local: 0, value: column(0) },
            { kind: "set", local: 1, value: { kind: "binary", operator: ">", left: column(1), right: { kind: "number", value: 3 } } },
            { kind: "store", column: 2, value: { kind: "unary", operator: "!", operand: local(0) } },
            { kind: "store", column: 3, value: { kind: "logical", operator: "&&", left: local(0), right: local(1) } },
            { kind: "store", column: 4, value: local(1) },
        ],
    };
    const flag = (component: number): WasmColumn => ({ view: "u8", stride: 1, offset: 0, boolean: true, component });
    const columns: WasmColumn[] = [flag(0), { view: "i32", stride: 4, offset: 0, boolean: false, component: 1 }, flag(2), flag(3), dense("f64", 4)];
    const rows = [[0, 0], [1, 0], [0, 4], [1, 4], [1, -5], [0, 2147483647]];

    it("hold booleans as i32 0 and 1, read as JS reads them, converting only what's stored as a number", () => {
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const flags = new Uint8Array(memory.buffer, 0, rows.length);
        const counts = new Int32Array(memory.buffer, 1024, rows.length);
        rows.forEach(([on, count], r) => { flags[r] = on; counts[r] = count; });
        const outputs = [new Uint8Array(memory.buffer, 2048, rows.length), new Uint8Array(memory.buffer, 3072, rows.length), new Float64Array(memory.buffer, 4096, rows.length)];
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows.length, 0, -1, 0, 1024, 2048, 3072, 4096);
        expect(rows.map((_, r) => outputs.map(output => output[r]))).toEqual(rows.map(([on, count]) => [Number(!on), Number(on === 1 && count > 3), Number(count > 3)]));
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect(wat.wat.match(/f64\.[a-z_0-9]+/g)).toEqual(["f64.convert_i32_u", "f64.store"]);
    });
});

describe("generateWasm nested branch-free conditionals", () => {
    it("test a nested if once, before either arm writes what the test reads", () => {
        const column = (index: number): Expression => ({ kind: "column", column: index });
        const number = (value: number): Expression => ({ kind: "number", value });
        const program: Program = {
            locals: 0,
            body: [{
                kind: "if", test: { kind: "binary", operator: ">", left: column(0), right: number(0) },
                consequent: [{
                    kind: "if", test: { kind: "binary", operator: "<=", left: column(1), right: number(0) },
                    consequent: [{ kind: "store", column: 1, value: number(5) }],
                    alternate: [{ kind: "store", column: 1, value: number(0) }],
                }],
                alternate: [],
            }],
        };
        const columns: WasmColumn[] = [0, 1].map(component => ({ view: "i32", stride: 4, offset: 0, boolean: false, component }));
        const kernel = generateWasm(program, columns, () => "number");
        if (kernel === null) throw new Error("expected a kernel");
        const rows = [[1, 0], [1, 3], [1, -2], [0, 0], [0, 3]];
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const [on, hp] = [0, 1].map(k => new Int32Array(memory.buffer, 1024 * k, rows.length));
        rows.forEach(([a, b], r) => { on[r] = a; hp[r] = b; });
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows.length, 0, -1, 0, 1024);
        expect([...hp]).toEqual(rows.map(([a, b]) => a > 0 ? (b <= 0 ? 5 : 0) : b));
    });
    /** An i32 field and an f32 field, each stored twice in one branch-free if, read back between, and a flag given a number. */
    const fields: Program = {
        locals: 0,
        body: [{
            kind: "if", test: { kind: "binary", operator: ">", left: { kind: "column", column: 0 }, right: { kind: "number", value: 0 } },
            consequent: [
                { kind: "store", column: 0, value: { kind: "binary", operator: "*", left: { kind: "column", column: 0 }, right: { kind: "number", value: 2 } } },
                { kind: "store", column: 1, value: { kind: "binary", operator: "+", left: { kind: "column", column: 1 }, right: { kind: "column", column: 0 } } },
                { kind: "store", column: 0, value: { kind: "binary", operator: "-", left: { kind: "column", column: 0 }, right: { kind: "number", value: 1 } } },
                { kind: "store", column: 2, value: { kind: "column", column: 0 } },
            ],
            alternate: [{ kind: "store", column: 1, value: { kind: "number", value: 0.1 } }],
        }],
    };
    const fieldColumns: WasmColumn[] = [
        { view: "i32", stride: 4, offset: 0, boolean: false, component: 0 },
        { view: "f32", stride: 4, offset: 0, boolean: false, component: 1 },
        { view: "u8", stride: 1, offset: 0, boolean: true, component: 2 },
    ];

    it("hold what an if stores in a local across its arms, read back as stored, written once after it", () => {
        const kernel = generateWasm(fields, fieldColumns, () => "number", false);
        if (kernel === null) throw new Error("expected a kernel");
        const rows: [number, number][] = [[3, 1.5], [-1, 2.25], [0, 7], [200, 0.1], [2147483647, -3]];
        const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
        const counts = new Int32Array(memory.buffer, 0, rows.length);
        const amounts = new Float32Array(memory.buffer, 1024, rows.length);
        const flags = new Uint8Array(memory.buffer, 2048, rows.length);
        rows.forEach(([count, amount], r) => { counts[r] = count; amounts[r] = amount; flags[r] = 9; });
        const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
        if (typeof run !== "function") throw new Error("no run export");
        run(0, rows.length, 0, -1, 0, 1024, 2048);
        const reference = rows.map(([count, amount]) => {
            const row = { count: new Int32Array([count]), amount: new Float32Array([amount]), flag: new Uint8Array([9]) };
            if (row.count[0] > 0) {
                row.count[0] = row.count[0] * 2;
                row.amount[0] = row.amount[0] + row.count[0];
                row.count[0] = row.count[0] - 1;
                row.flag[0] = row.count[0];
            }
            else row.amount[0] = 0.1;
            return [row.count[0], row.amount[0], row.flag[0]];
        });
        expect(rows.map((_, r) => [counts[r], amounts[r], flags[r]])).toEqual(reference);
        const wat = printWat(kernel.bytes);
        if ("failure" in wat) throw new Error(wat.failure);
        expect([/i32\.load\b/g, /f32\.load\b/g, /i32\.load8_u\b/g, /i32\.store\b/g, /f32\.store\b/g, /i32\.store8\b/g].map(pattern => wat.wat.match(pattern)?.length ?? 0)).toEqual([1, 1, 1, 1, 1, 1]);
    });
});

describe("generateWasm row addresses", () => {
    it("step each column's address from the start row, through rows that end early", () => {
        const column = (index: number): Expression => ({ kind: "column", column: index });
        const program: Program = {
            locals: 0,
            body: [
                { kind: "if", test: { kind: "binary", operator: "<", left: column(0), right: { kind: "number", value: 0 } }, consequent: [{ kind: "next" }], alternate: [] },
                { kind: "store", column: 2, value: { kind: "binary", operator: "+", left: column(0), right: column(1) } },
            ],
        };
        const columns: WasmColumn[] = [
            { view: "i32", stride: 12, offset: 4, boolean: false, component: 0 },
            { view: "f64", stride: 8, offset: 0, boolean: false, component: 1 },
            { view: "f64", stride: 24, offset: 16, boolean: false, component: 2 },
        ];
        for (const simd of [true, false]) {
            const kernel = generateWasm(program, columns, () => "number", simd);
            if (kernel === null) throw new Error("expected a kernel");
            const rows = 23;
            const memory = new WebAssembly.Memory({ initial: 1, maximum: 65536, shared: true });
            const counts = new Int32Array(memory.buffer, 0, 3 * rows);
            const amounts = new Float64Array(memory.buffer, 1024, rows);
            const sums = new Float64Array(memory.buffer, 2048, 3 * rows);
            for (let r = 0; r < rows; r++) { counts[3 * r + 1] = r % 5 === 0 ? -r : r; amounts[r] = r * 0.5; sums[3 * r + 2] = -1; }
            const run = new WebAssembly.Instance(new WebAssembly.Module(kernel.bytes), { env: { memory }, math: importsOf(kernel.imports) }).exports.run;
            if (typeof run !== "function") throw new Error("no run export");
            run(3, rows, 0, -1, 0, 1024, 2048);
            expect([simd, Array.from({ length: rows }, (_, r) => sums[3 * r + 2])]).toEqual([simd, Array.from({ length: rows }, (_, r) => r < 3 || r % 5 === 0 ? -1 : r + r * 0.5)]);
        }
    });
});
