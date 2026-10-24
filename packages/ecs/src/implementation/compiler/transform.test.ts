// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { blockShift, chunkShift, type KernelDescription, type KernelModule, type Program } from '../world/kernel.js';
import { transformKernels } from './transform.js';
import { createLinker, type LinkHost } from './link.js';
import { ownCopy } from './paths.js';
import { locateThroughMap } from './source-map.js';
import { estreeOf } from './estree.js';
import { Mat4x4, Quat, Vec3 } from '../../interface/math/index.js';
import { generateWgsl } from '../world/wgsl.js';
import { identityOf } from '../world/reductions.js';
import type { WasmColumn } from '../world/wasm.js';

const parse = (code: string) => estreeOf(parseAst(code));

const header = `import { System } from "ecs";
const position = "position";
const velocity = "velocity";
const mass = "mass";
const alive = "alive";
const score = "score";
const delta = "delta";
const target = "target";
`;

/** The operators the test module's resources declare in their `reduce` traits, by binding. */
type Reductions = { readonly [binding: string]: string };
const reductions: Reductions = { total: "+", low: "min", bits: "|" };

/**
 * Modules by absolute path, for tests of imports: real files for anything not in `files`, and "ecs" for the package;
 * the test module's resources reduce with `reduced`.
 */
const host = (files: { readonly [file: string]: string }, reduced: Reductions = reductions): LinkHost => ({
    reductions: file => new Map(file === "/test.js" ? Object.entries(reduced) : []),
    resolve: async (specifier, importer) => {
        if (specifier === "ecs") return ownCopy.index;
        if (specifier === "external") return { error: "external is external to the build", unreadable: true };
        if (!specifier.startsWith(".")) return { error: `${specifier} can't be resolved from ${importer}` };
        const path = resolve(dirname(importer), specifier);
        const typescript = path.replace(/\.js$/, ".ts");
        return files[typescript] !== undefined || (files[path] === undefined && existsSync(typescript)) ? typescript : path;
    },
    load: async file => {
        const code = files[file] ?? await readFile(file, "utf8");
        if (!file.endsWith(".ts")) return { code };
        const { transformWithOxc } = await import("vite");
        const result = await transformWithOxc(code, file, { lang: "ts", sourcemap: true });
        return { code: result.code, locate: result.map === undefined ? undefined : locateThroughMap(result.code, result.map.mappings) };
    },
});

const transform = (source: string, files: { readonly [file: string]: string } = {}, reduced: Reductions = reductions) => transformKernels(`${header}${source}`, "/test.js", parse,
    async specifier => specifier === "ecs" ? ownCopy : null, index => JSON.stringify(`kernel:${index}`), createLinker(host(files, reduced), parse));

type Compiled = KernelDescription & KernelModule;

/**
 * Compiles `source`, which assigns its kernel system to `kernel`: the attached description plus its kernel module's
 * `create`. `imported` gives the values of the bindings `source` imports, since its imports aren't evaluated.
 */
const compile = async (source: string, files: { readonly [file: string]: string } = {}, imported: { readonly [name: string]: unknown } = {}, reduced: Reductions = reductions): Promise<Compiled> => {
    const result = await transform(source, files, reduced);
    if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
    const module = result.code.split("\n").filter(line => !line.startsWith("import ")).join("\n");
    const evaluate = new Function("System", "attachKernel$", "Archetype", ...Object.keys(imported), `${module}\nreturn kernel;`);
    const description: KernelDescription = evaluate({ create: (declaration: unknown, body: unknown) => ({ declaration, body }) }, (_: unknown, attached: unknown) => attached, { create: (list: unknown) => list }, ...Object.values(imported));
    const index = Number(description.url.slice("kernel:".length));
    const kernelModule: KernelModule = new Function(`${result.kernels[index]?.replace("export const create =", "const create =")}\nreturn { create };`)();
    expect(kernelModule.create.toString()).not.toMatch(/\b(position|velocity|mass|alive|score|delta|target)\b/);
    return { ...description, ...kernelModule };
};

const failure = async (source: string, files: { readonly [file: string]: string } = {}, reduced: Reductions = reductions): Promise<string> => {
    const result = await transform(source, files, reduced);
    return result !== null && "failure" in result ? result.failure.message : "compiled";
};

type Fields = { readonly [component: string]: { readonly [path: string]: readonly number[] } };
type Call = readonly unknown[];
type Options = {
    readonly resources?: readonly unknown[];
    readonly lookups?: readonly ((entity: number) => readonly unknown[] | null)[];
    readonly args?: unknown;
    readonly booleans?: readonly string[];
    /** Whether the kernel has a `program`; when it does, the program must give the same results as the JS. */
    readonly program?: boolean;
    /** The rows to run, `[start, end)`; all rows by default. */
    readonly range?: readonly [number, number];
    readonly interleaved?: { readonly [component: string]: { readonly stride: number; readonly offsets: { readonly [path: string]: number } } };
};

const tick = 7;

type Scalar = number | boolean;
type Signal = { readonly kind: "normal" } | { readonly kind: "branch"; readonly depth: number } | { readonly kind: "next" };
const normal: Signal = { kind: "normal" };

/** A reference interpreter for `Program`: JS number semantics, boolean typing of columns from `booleans`. */
type Layout = { readonly strides: readonly number[]; readonly offsets: readonly number[] };

/** A reference interpreter for `Program`, indexing columns by the layout as the WASM generator does. */
const interpret = (program: Program, columns: readonly (Float64Array | Uint32Array)[], booleans: readonly boolean[], layout: Layout, start: number, end: number, resources: readonly unknown[], args: unknown,
    lookups: readonly ((entity: number) => readonly unknown[] | null)[], partials: Float64Array): void => {
    const accumulators = program.reductions ?? [];
    /** Accumulators carry from row to row, from their partials and back. */
    const carried = accumulators.map((_, k) => partials[k] ?? NaN);
    const at = (column: number, row: number): number => row * (layout.strides[column] ?? 1) + (layout.offsets[column] ?? 0);
    const scalarAt = (root: unknown, path: readonly (number | string)[]): Scalar => {
        const value = path.reduce<unknown>((item, key) => Reflect.get(Object(item), key), root);
        if (typeof value !== "number" && typeof value !== "boolean") throw new Error(`not a scalar: ${String(value)}`);
        return value;
    };
    for (let row = start; row < end; row++) {
        const locals: Scalar[] = new Array<Scalar>(program.locals).fill(0);
        const handles: (readonly unknown[] | null)[] = new Array<readonly unknown[] | null>(program.handles ?? 0).fill(null);
        const evaluate = (node: Program.Expression): Scalar => {
            switch (node.kind) {
                case "number": case "boolean": return node.value;
                case "column": {
                    const value = columns[node.column]?.[at(node.column, row)] ?? NaN;
                    return booleans[node.column] === true ? value !== 0 : value;
                }
                case "resource": return scalarAt(resources[node.index], node.path);
                case "args": return scalarAt(args, node.path);
                case "local": return locals[node.local] ?? NaN;
                case "unary": {
                    const operand = evaluate(node.operand);
                    switch (node.operator) {
                        case "-": return -Number(operand);
                        case "+": return Number(operand);
                        case "!": return !operand;
                        case "~": return ~Number(operand);
                    }
                }
                case "binary": {
                    const left = evaluate(node.left);
                    const right = evaluate(node.right);
                    const a = Number(left);
                    const b = Number(right);
                    switch (node.operator) {
                        case "+": return a + b;
                        case "-": return a - b;
                        case "*": return a * b;
                        case "/": return a / b;
                        case "%": return a % b;
                        case "**": return a ** b;
                        case "<": return a < b;
                        case ">": return a > b;
                        case "<=": return a <= b;
                        case ">=": return a >= b;
                        case "==": return a === b;
                        case "!=": return a !== b;
                        case "===": return left === right;
                        case "!==": return left !== right;
                        case "&": return a & b;
                        case "|": return a | b;
                        case "^": return a ^ b;
                        case "<<": return a << b;
                        case ">>": return a >> b;
                        case ">>>": return a >>> b;
                    }
                }
                case "logical": {
                    const left = evaluate(node.left);
                    return node.operator === "&&" ? (left ? evaluate(node.right) : left) : (left ? left : evaluate(node.right));
                }
                case "conditional": return evaluate(node.test) ? evaluate(node.consequent) : evaluate(node.alternate);
                case "found": return handles[node.handle] !== null;
                case "lookupLeaf": {
                    // Not found reads NaN, as the WASM generator does.
                    const values = handles[node.handle];
                    if (values === null || values === undefined) return NaN;
                    return scalarAt(values[node.read], node.path);
                }
                case "math": {
                    const method: unknown = Reflect.get(Math, node.name);
                    if (typeof method !== "function") throw new Error(`no Math.${node.name}`);
                    const result: unknown = Reflect.apply(method, Math, node.arguments.map(item => Number(evaluate(item))));
                    return typeof result === "number" ? result : NaN;
                }
                case "lane": return evaluate(node.value);
                case "upFound": case "upLeaf": throw new Error("programs reading up aren't interpreted here");
                case "listLength": case "listChanged": case "rowLeaf": case "rowEntity": throw new Error("lookups through indexes aren't interpreted here");
            }
        };
        const execute = (statements: readonly Program.Statement[]): Signal => {
            for (const statement of statements) {
                const signal = step(statement);
                if (signal.kind !== "normal") return signal;
            }
            return normal;
        };
        const outward = (signal: Signal): Signal => signal.kind === "branch" ? (signal.depth === 0 ? normal : { kind: "branch", depth: signal.depth - 1 }) : signal;
        const step = (statement: Program.Statement): Signal => {
            switch (statement.kind) {
                case "set": locals[statement.local] = evaluate(statement.value); return normal;
                case "store": { const column = columns[statement.column]; if (column) column[at(statement.column, row)] = Number(evaluate(statement.value)); return normal; }
                case "stamp": {
                    const column = columns[statement.column];
                    const chunks = columns[statement.chunks];
                    const blocks = columns[statement.blocks];
                    if (column) column[at(statement.column, row)] = tick;
                    if (chunks) chunks[row >> chunkShift] = tick;
                    if (blocks) blocks[row >> blockShift] = tick;
                    return normal;
                }
                case "if": return execute(evaluate(statement.test) ? statement.consequent : statement.alternate);
                case "block": return outward(execute(statement.body));
                case "loop":
                    for (let iteration = 0; iteration < 1e6; iteration++) {
                        const signal = execute(statement.body);
                        if (signal.kind === "branch" && signal.depth === 0) continue;
                        return signal.kind === "normal" ? normal : outward(signal);
                    }
                    throw new Error("runaway loop");
                case "branch": return { kind: "branch", depth: statement.depth };
                case "branchIf": return evaluate(statement.test) ? { kind: "branch", depth: statement.depth } : normal;
                case "next": return { kind: "next" };
                case "intrinsic": return execute(statement.body);
                case "find": {
                    const lookup = lookups[statement.lookup];
                    if (lookup === undefined) throw new Error(`no lookup ${statement.lookup}`);
                    handles[statement.handle] = lookup(Number(evaluate(statement.entity)));
                    return normal;
                }
                case "probe": case "listRow": throw new Error("lookups through indexes aren't interpreted here");
            }
        };
        accumulators.forEach((local, k) => { locals[local] = carried[k] ?? NaN; });
        execute(program.body);
        accumulators.forEach((local, k) => { carried[k] = Number(locals[local]); });
    }
    carried.forEach((value, k) => { partials[k] = value; });
};

/** Padding in interleaved components, which kernels must never touch. */
const padding = -12345;

/**
 * Runs a kernel over hand-built columns; `fields` maps a component to its leaves by JSON path. A component in
 * `options.interleaved` stores its leaves in one array with that stride, at the given offsets per path; others are dense.
 */
const run = (description: Compiled, rows: number, fields: Fields, options: Options = {}) => {
    const interleaved = options.interleaved ?? {};
    const layout: Layout = {
        strides: description.columns.map(column => column.kind === "field" ? interleaved[String(column.component)]?.stride ?? 1 : 1),
        offsets: description.columns.map(column => column.kind === "field" ? interleaved[String(column.component)]?.offsets[JSON.stringify(column.path)] ?? 0 : 0),
    };
    const build = () => {
        const shared = new Map<string, Float64Array>();
        return description.columns.map((column, index) => {
            if (column.kind === "entity") return Float64Array.from({ length: rows }, (_, row) => 100 + row);
            if (column.kind === "changed") return new Uint32Array(rows);
            if (column.kind === "chunks") return new Float64Array(Math.ceil(rows / 2 ** chunkShift));
            if (column.kind === "blocks") return new Float64Array(Math.ceil(rows / 2 ** blockShift));
            const component = String(column.component);
            const values = fields[component]?.[JSON.stringify(column.path)] ?? new Array<number>(rows).fill(0);
            const stride = interleaved[component]?.stride;
            if (stride === undefined) return Float64Array.from(values);
            const array = shared.get(component) ?? new Float64Array(rows * stride).fill(padding);
            shared.set(component, array);
            values.forEach((value, row) => { array[row * stride + (layout.offsets[index] ?? 0)] = value; });
            return array;
        });
    };
    const columns = build();
    const calls: Call[] = [];
    // Records each command start as [kind, entity], and each value or component as [kind, entity, key index, value?].
    let current: readonly [number | "spawn", number] = ["spawn", 0];
    const commands = {
        spawners: description.spawns.map(list => (...values: unknown[]) => {
            current = ["spawn", 999];
            calls.push(current);
            list.forEach((key, k) => calls.push([...current, key, values[k]]));
            return 999;
        }),
        begin: (kind: number, entity: number) => { current = [kind, entity]; calls.push(current); },
        value: (key: number, value: unknown) => { calls.push([...current, key, value]); },
        component: (key: number) => { calls.push([...current, key]); },
    };
    const booleans = description.columns.map(column => column.kind === "field" && (options.booleans ?? []).includes(String(column.component)));
    const [start, end] = options.range ?? [0, rows];
    const partials = Float64Array.from(description.reductions, reduction => identityOf(reduction.operator));
    const interpretedPartials = Float64Array.from(partials);
    description.create(booleans, layout.strides, layout.offsets)(columns, start, end, options.resources ?? [], options.lookups ?? [], description.keys, options.args, commands, tick, partials, 0);
    expect(description.program !== null).toBe(options.program ?? true);
    if (description.program !== null) {
        const interpreted = build();
        interpret(description.program, interpreted, booleans, layout, start, end, options.resources ?? [], options.args, options.lookups ?? [], interpretedPartials);
        expect([...interpretedPartials]).toEqual([...partials]);
        // Bit-identical, including NaN and -0.
        expect(interpreted.map(column => [...column].map(value => Object.is(value, -0) ? "-0" : String(value))))
            .toEqual(columns.map(column => [...column].map(value => Object.is(value, -0) ? "-0" : String(value))));
    }
    const index = (kind: string, component: string, path: readonly (number | string)[] = []) => description.columns.findIndex(column =>
        column.kind === kind && column.kind !== "entity" && column.component === component
        && (column.kind !== "field" || JSON.stringify(column.path) === JSON.stringify(path)));
    return {
        field: (component: string, path: readonly (number | string)[] = []) => {
            const column = index("field", component, path);
            return Array.from({ length: rows }, (_, row) => columns[column]?.[row * (layout.strides[column] ?? 1) + (layout.offsets[column] ?? 0)]);
        },
        /** A component's whole interleaved array, padding included. */
        array: (component: string) => [...columns[index("field", component, [0])] ?? []],
        changed: (component: string) => [...columns[index("changed", component)] ?? []],
        /** A reduced resource's leaf, folded over the rows from its identity. */
        reduced: (resource: string, path: readonly (number | string)[] = []) =>
            partials[description.reductions.findIndex(reduction => reduction.resource === resource && JSON.stringify(reduction.path) === JSON.stringify(path))],
        chunks: (component: string) => [...columns[index("chunks", component)] ?? []],
        calls,
    };
};

const vec3 = (x: readonly number[], y: readonly number[], z: readonly number[]) => ({ "[0]": x, "[1]": y, "[2]": z });

describe("kernels by default", () => {
    /** Whether the transform attached a kernel to the module's system, and the failure if it failed. */
    const attached = async (source: string): Promise<boolean | string> => {
        const result = await transform(source);
        if (result === null) return false;
        return "failure" in result ? result.failure.message : result.code.includes("attachKernel$(");
    };
    test("compiles a system with components whose body is in the subset, unflagged", async () => {
        expect(await attached(`const kernel = System.create({ components: { read: [mass], write: [score] } }, row => { row[score] = row[mass] * 2; });`)).toBe(true);
    });
    test("runs as written, without failing, a body that leaves the subset or a declaration a kernel can't have", async () => {
        expect(await attached(`const log = []; const kernel = System.create({ components: { read: [mass] } }, row => { log.push(row[mass]); });`)).toBe(false);
        expect(await attached(`const kernel = System.create({ components: { read: [mass] }, resources: { write: [delta] } }, (row, { resources }) => { resources[delta] = row[mass]; });`)).toBe(false);
        expect(await attached(`const kernel = System.create({ observer: true, components: { read: [mass] } }, row => { void row[mass]; });`)).toBe(false);
        expect(await attached(`const kernel = System.create({ target: "entity", components: { write: [score] } }, row => { row[score] = 1; });`)).toBe(false);
        expect(await attached(`const make = () => System.create({ components: { write: [score] } }, row => { row[score] = 1; });`)).toBe(false);
    });
    test("runs as written a body reading data of a module object or array, which may change, and compiles one reading constants and functions", async () => {
        expect(await attached(`export const scene = { subject: 0 }; const kernel = System.create({ components: { write: [score] } }, row => { row[score] = scene.subject; });`)).toBe(false);
        expect(await attached(`const values = [1, 2]; const kernel = System.create({ components: { write: [score] } }, row => { row[score] = values[0]; });`)).toBe(false);
        expect(await attached(`const half = 0.5; const twice = x => x * 2; const kernel = System.create({ components: { read: [mass], write: [score] } }, row => { row[score] = twice(row[mass]) * half; });`)).toBe(true);
        expect(await failure(`export const scene = { subject: 0 }; const kernel = System.create({ kernel: true, components: { write: [score] } }, row => { row[score] = scene.subject; });`)).toBe("compiled");
    });
    test("never compiles a system without components or with kernel: false", async () => {
        expect(await attached(`const kernel = System.create({ resources: { read: [delta] } }, ({ resources }) => { void resources[delta]; });`)).toBe(false);
        expect(await attached(`const kernel = System.create({ kernel: false, components: { read: [mass], write: [score] } }, row => { row[score] = row[mass]; });`)).toBe(false);
    });
    test("fails, saying why, a system with kernel: true that can't compile", async () => {
        expect(await attached(`const kernel = System.create({ kernel: true, resources: { read: [delta] } }, ({ resources }) => { void resources[delta]; });`))
            .toBe("a system without components runs once, so there's nothing to compile");
        expect(await attached(`const log = []; const kernel = System.create({ kernel: true, components: { read: [mass] } }, row => { log.push(row[mass]); });`)).not.toBe(true);
        expect(await attached(`const make = () => System.create({ kernel: true, components: { write: [score] } }, row => { row[score] = 1; });`))
            .toBe("kernel systems must be declared at module scope");
    });
});

describe("particles", () => {
    test("gravity and integrate", async () => {
        const gravity = await compile(`const kernel = System.create({
            kernel: true,
            components: { write: [velocity] }, resources: { read: [delta] },
        }, (row, { resources }) => {
            const [x, y, z] = row[velocity];
            row[velocity] = [x, y - 9.8 * resources[delta], z];
        });`);
        const fallen = run(gravity, 2, { velocity: vec3([1, 2], [0, 10], [3, 4]) }, { resources: [0.5] });
        expect([fallen.field("velocity", [0]), fallen.field("velocity", [1]), fallen.field("velocity", [2])]).toEqual([[1, 2], [-4.9, 5.1], [3, 4]]);
        expect(fallen.changed("velocity")).toEqual([tick, tick]);
        expect(gravity.shapes).toEqual([{ component: "velocity", leaves: [[0], [1], [2]] }]);
        expect(gravity.resources).toEqual(["delta"]);

        const integrate = await compile(`const kernel = System.create({
            kernel: true,
            components: { read: [velocity], write: [position] }, resources: { read: [delta] }, after: [{ name: "particles/gravity" }],
        }, (row, { resources }) => {
            const [px, py, pz] = row[position];
            const [vx, vy, vz] = row[velocity];
            const t = resources[delta];
            row[position] = [px + vx * t, py + vy * t, pz + vz * t];
        });`);
        const moved = run(integrate, 1, { position: vec3([1], [2], [3]), velocity: vec3([2], [4], [6]) }, { resources: [0.5] });
        expect([moved.field("position", [0]), moved.field("position", [1]), moved.field("position", [2])]).toEqual([[2], [4], [6]]);
        expect(moved.changed("position")).toEqual([tick]);
        expect(integrate.columns.some(column => column.kind === "changed" && column.component === "velocity")).toBe(false);
        // Plain reads: no boolean conversion where it isn't observable.
        for (const kernel of [gravity, integrate]) expect(String(kernel.create)).not.toMatch(/\?|booleans\[/);
    });
});

describe("layout", () => {
    test("interleaved components are read and written at row * stride + offset, leaving padding untouched", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [alive], write: [velocity] } }, (row) => {
            const [x, y, z] = row[velocity];
            row[velocity] = [z, row[alive] === true ? y * 10 : y, x];
        });`);
        const result = run(kernel, 2, { velocity: vec3([1, 4], [2, 5], [3, 6]), alive: { "[]": [1, 0] } }, {
            booleans: ["alive"],
            interleaved: { velocity: { stride: 4, offsets: { "[0]": 0, "[1]": 1, "[2]": 2 } }, alive: { stride: 3, offsets: { "[]": 2 } } },
        });
        expect(result.array("velocity")).toEqual([3, 20, 1, padding, 6, 5, 4, padding]);
        expect(result.changed("velocity")).toEqual([tick, tick]);
    });

    test("stamps set the changed row and its chunk; each changed column is followed by its chunk column", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => {
            if (row[mass] > 0) row[score] = 1;
        });`);
        const rows = 2 * 2 ** chunkShift + 5;
        const mass = new Array<number>(rows).fill(0);
        mass[2 ** chunkShift + 3] = 1;
        const result = run(kernel, rows, { mass: { "[]": mass } });
        const changed = kernel.columns.findIndex(column => column.kind === "changed");
        expect(kernel.columns[changed + 1]).toEqual({ kind: "chunks", component: "score" });
        expect(result.chunks("score")).toEqual([0, tick, 0]);
        expect(result.changed("score").flatMap((value, row) => value === 0 ? [] : [row])).toEqual([2 ** chunkShift + 3]);
    });

    test("an unconditional stamp stamps the call's chunks once; a stamp after return stays per row", async () => {
        const always = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => {
            row[score] = row[mass];
        });`);
        expect(String(always.create)).not.toContain(">> 10] = tick");
        expect(run(always, 3200, {}, { range: [1000, 2100] }).chunks("score")).toEqual([tick, tick, tick, 0]);
        const after = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => {
            if (row[mass] > 0) return;
            row[score] = 1;
        });`);
        expect(String(after.create)).toContain("[i >> 10] = tick");
        const mass = Array.from({ length: 3200 }, (_, row) => row >= 1024 && row < 2048 ? 1 : 0);
        expect(run(after, 3200, { mass: { "[]": mass } }, { range: [1000, 2100] }).chunks("score")).toEqual([tick, 0, tick, 0]);
    });

    test("indices stay in step when return skips the rest of a row", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { write: [velocity] } }, (row) => {
            const [x, y, z] = row[velocity];
            if (x > 1 && x < 5) return;
            row[velocity] = [z, y, x];
        });`);
        const result = run(kernel, 3, { velocity: vec3([1, 4, 7], [2, 5, 8], [3, 6, 9]) }, { interleaved: { velocity: { stride: 4, offsets: { "[0]": 1, "[1]": 2, "[2]": 3 } } } });
        expect(result.array("velocity")).toEqual([padding, 3, 2, 1, padding, 4, 5, 6, padding, 9, 8, 7]);
        expect(result.changed("velocity")).toEqual([tick, 0, tick]);
    });
});

describe("reductions", () => {
    const reducing = (reduce: string, body: string, read = "[position, mass]") => `const total = "total";
const low = "low";
const bits = "bits";
const kernel = System.create({ kernel: true, components: { read: ${read} }, resources: { reduce: [${reduce}] } }, (row, { reduce }) => { ${body} });`;
    const fields = { position: vec3([1, -4, 2], [5, 0, -1], [3, 9, 6]), mass: { "[]": [2, 3, 12] } };

    test("fold each contribution into its resource, leaf by leaf, from the partial", async () => {
        const kernel = await compile(reducing("total, low, bits", `
            const [x, y, z] = row[position];
            reduce[total](row[mass]);
            reduce[total](1);
            reduce[low]([x, y, z]);
            reduce[bits](row[mass]);
        `));
        const result = run(kernel, 3, fields);
        expect(result.reduced("total")).toBe(2 + 3 + 12 + 3);
        expect([0, 1, 2].map(k => result.reduced("low", [k]))).toEqual([-4, -1, 3]);
        expect(result.reduced("bits")).toBe(2 | 3 | 12);
        expect(kernel.reductions.map(reduction => reduction.operator)).toEqual(["+", "min", "min", "min", "|"]);
    });

    test("fold the values of inlined functions", async () => {
        const kernel = await compile(`import { Vec3 } from "ecs";\n${reducing("low", "reduce[low](Vec3.scale(row[position], 2));", "[position]")}`, {}, {}, { low: "max" });
        expect([0, 1, 2].map(k => run(kernel, 3, fields).reduced("low", [k]))).toEqual([4, 10, 18]);
    });

    test("that can't be compiled fail with the reason", async () => {
        expect(await failure(reducing("total", "reduce[total](1, 2);"))).toBe("total takes the one value it reduces");
        expect(await failure(reducing("total", "reduce[total](1);"), {}, { total: "avg" })).toBe(`total is reduced, so the build reads its operator from its declaration's reduce trait, "avg", which isn't one of "+", "*", "min", "max", "&", "|", "^"`);
        expect(await failure(reducing("total", "reduce[total](1);"), {}, {})).toBe("total is reduced, so the build reads its operator from its declaration's reduce trait, which it can't find: declare the resource with reduce in the module that makes its key");
        expect(await failure(reducing("total", "reduce[total](1);").replace(`kernel: true`, `kernel: "gpu"`))).toBe("a GPU kernel can't use reductions yet");
        expect(await failure(reducing("total", "reduce[total](1);").replace("resources: { reduce:", "resources: { read: [total], reduce:"))).toBe("total is reduced, so it can't also be read or filtered on");
        expect(await failure(reducing("total, total", "reduce[total](1);"))).toBe("total is reduced twice");
    });
});

describe("let locals of component values", () => {
    test("written back whole after a tuple assignment have the tuple's shape", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [alive], write: [position] } }, (row) => {
            let v = row[position];
            if (row[alive]) v = [7, 8, 9];
            row[position] = v;
        });`);
        expect(kernel.columns.some(column => column.kind === "field" && column.path.length === 0 && column.component === "position")).toBe(false);
        const result = run(kernel, 2, { position: vec3([1, 4], [2, 5], [3, 6]), alive: { "[]": [1, 0] } });
        expect([0, 1, 2].map(k => result.field("position", [k]))).toEqual([[7, 4], [8, 5], [9, 6]]);
    });
});

describe("binding identity", () => {
    test("a local shadowing a component key is not that component", async () => {
        expect(await failure(`const kernel = System.create({ kernel: true, components: { read: [velocity], write: [position] } }, (row) => {
            const velocity = 1;
            row[position] = row[velocity];
        });`)).toBe("row is indexed by a component in components read or write, or .entity");
    });

    test("another binding with the same key string is not the declared component", async () => {
        expect(await failure(`const speed = "velocity";
        const kernel = System.create({ kernel: true, components: { read: [velocity], write: [position] } }, (row) => {
            row[position] = row[speed];
        });`)).toBe("speed is not in components read or write");
    });

    test("a helper parameter shadows a module binding only inside the helper", async () => {
        const kernel = await compile(`const twice = (velocity) => velocity * 2;
        const kernel = System.create({ kernel: true, components: { read: [velocity], write: [position] } }, (row) => {
            row[position] = twice(row[velocity]) + row[velocity];
        });`);
        expect(run(kernel, 1, { velocity: { "[]": [3] } }).field("position")).toEqual([9]);
    });
});

describe("value semantics", () => {
    test("tuple locals are copies, and snapshots read before later writes", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { write: [position, score] } }, (row) => {
            const before = row[position];
            let v = [before[0], before[1]];
            const w = v;
            v = [10, v[1]];
            row[position] = [v[0], 20];
            row[score] = w[0] * 100 + before[1] + row[position][1];
        });`);
        const result = run(kernel, 1, { position: { "[0]": [1], "[1]": [2] } });
        expect(result.field("position", [0])).toEqual([10]);
        expect(result.field("score")).toEqual([100 + 2 + 20]);
    });

    test("whole-value writes evaluate every leaf before storing", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { write: [position, score] } }, (row) => {
            row[position] = [row[position][1], row[position][0]];
            let a = 1;
            let b = 2;
            [a, b] = [b, a];
            row[score] = a * 10 + b;
        });`);
        const result = run(kernel, 1, { position: { "[0]": [1], "[1]": [2] } });
        expect([result.field("position", [0]), result.field("position", [1])]).toEqual([[2], [1]]);
        expect(result.field("score")).toEqual([21]);
    });

    test("struct values and conditional tuples", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [position] } }, (row) => {
            const p = row[mass] > 1 ? { x: 1, y: [2, 3] } : { x: 4, y: [5, 6] };
            row[position] = p;
        });`);
        expect(kernel.shapes).toEqual([{ component: "position", leaves: [["x"], ["y", 0], ["y", 1]] }]);
        const result = run(kernel, 2, { mass: { "[]": [2, 0] } });
        expect(result.field("position", ["y", 1])).toEqual([3, 6]);
    });
});

describe("helpers", () => {
    test("block helpers inline hygienically with tuples flowing through", async () => {
        const kernel = await compile(`const scale = (v, s) => {
            const [x, y] = v;
            const k = s * 2;
            return [x * k, y * k];
        };
        const length = ([x, y]) => Math.sqrt(x * x + y * y);
        const kernel = System.create({ kernel: true, components: { write: [position, score] } }, (row) => {
            const k = 100;
            const x = 1;
            row[position] = scale(row[position], 0.5);
            row[score] = length(row[position]) + k + x;
        });`);
        const result = run(kernel, 1, { position: { "[0]": [3], "[1]": [4] } });
        expect([result.field("position", [0]), result.field("position", [1])]).toEqual([[3], [4]]);
        expect(result.field("score")).toEqual([106]);
    });

    test("recursive helpers are rejected", async () => {
        expect(await failure(`const f = (x) => f(x);
        const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = f(1); });`))
            .toBe("f is recursive");
    });
});

describe("control flow", () => {
    test("return ends the row, also from inside a loop", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => {
            if (row[mass] < 0) return;
            let total = 0;
            for (let i = 0; i < 10; i++) {
                if (i % 2 === 0) continue;
                if (i > row[mass]) return;
                total += i;
            }
            row[score] = total;
        });`);
        expect(run(kernel, 3, { mass: { "[]": [-1, 20, 3] }, score: { "[]": [5, 5, 5] } }).field("score")).toEqual([5, 25, 5]);
    });

    test("a loop test that inlines a helper is re-evaluated each iteration", async () => {
        const kernel = await compile(`const below = (a, b) => { const limit = b * 2; return a < limit; };
        const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => {
            let n = 0;
            while (below(n, row[mass])) { n++; }
            let m = 0;
            do { m += 1; } while (m < 3);
            row[score] = n * 10 + m;
        });`);
        expect(run(kernel, 1, { mass: { "[]": [3] } }).field("score")).toEqual([63]);
    });
});

describe("context", () => {
    test("lookups map components to their read index, with null guards", async () => {
        const kernel = await compile(`const half = (value) => { const h = value / 2; return h; };
        const kernel = System.create({ kernel: true, components: { read: [target], write: [position, score] }, lookup: { targets: { read: [mass, position] } } }, (row, { lookup: { targets } }) => {
            const other = targets(row[target]);
            if (other !== null) { row[position] = other[position] - other[mass]; }
            row[score] = (other !== null && half(other[position])) || -1;
        });`);
        expect(kernel.lookups).toEqual(["targets"]);
        const found = (entity: number) => entity === 1 ? [3, 10] : null;
        const result = run(kernel, 2, { target: { "[]": [1, 2] }, position: { "[]": [0, 0] } }, { lookups: [found], program: false });
        expect(result.field("position")).toEqual([7, 0]);
        expect(result.field("score")).toEqual([5, -1]);
    });

    test("optional lookup access, destructured context groups and input", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [target], write: [score] }, resources: { read: [delta] }, lookup: { targets: { read: [mass] } } }, (row, { resources: { [delta]: d }, lookup: { targets } }, input) => {
            row[score] = (targets(row[target])?.[mass] ?? 0) + d + input;
        });`);
        const found = (entity: number) => entity === 1 ? [3] : null;
        expect(run(kernel, 2, { target: { "[]": [1, 2] } }, { lookups: [found], resources: [10], args: 100, program: false }).field("score")).toEqual([113, 110]);
    });

    test("context groups reached through the context parameter", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [target], write: [score] }, resources: { read: [delta] }, lookup: { targets: { read: [mass] } } }, (row, context, input) => {
            const { resources } = context;
            row[score] = (context.lookup.targets(row[target])?.[mass] ?? 0) + resources[delta] + input;
        });`);
        const found = (entity: number) => entity === 1 ? [3] : null;
        expect(run(kernel, 2, { target: { "[]": [1, 2] } }, { lookups: [found], resources: [10], args: 100, program: false }).field("score")).toEqual([113, 110]);
    });

    test("boolean columns read as booleans", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [alive], write: [score] } }, (row) => {
            row[score] = row[alive] === true ? 1 : 2;
        });`);
        expect(run(kernel, 2, { alive: { "[]": [1, 0] } }, { booleans: ["alive"] }).field("score")).toEqual([1, 2]);
        expect(run(kernel, 1, { alive: { "[]": [1] } }).field("score")).toEqual([2]);
    });

    test("boolean reads convert only where observable, including through locals", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [alive, mass], write: [score] } }, (row, { commands }) => {
            const flag = row[alive];
            const copy = flag;
            row[score] = (copy === true ? 10 : 20) + row[mass] * 2 + (flag ? 1 : 0);
            commands.spawn([alive, mass])({ [alive]: flag, [mass]: row[mass] });
        });`);
        const result = run(kernel, 2, { alive: { "[]": [1, 0] }, mass: { "[]": [3, 4] } }, { booleans: ["alive"], program: false });
        expect(result.field("score")).toEqual([17, 28]);
        expect(result.calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, true], ["spawn", 999, 1, 3],
            ["spawn", 999], ["spawn", 999, 0, false], ["spawn", 999, 1, 4],
        ]);
        const source = String(kernel.create);
        // Converted: the snapshot of `flag` (observed through `copy ===` and spawn) and `mass` in the spawn value.
        expect(source.match(/ \? c\d+\[x\d+\] !== 0/g)?.length).toBe(2);
        expect(source.match(/booleans\[/g)?.length).toBe(2);
    });

    test("a spawn nested in an add's value is issued before the add begins", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass] } }, (row, { commands }) => {
            commands.add(row.entity, [target, score], { [target]: commands.spawn([mass])({ [mass]: row[mass] }), [score]: 1 });
            commands.despawn(row.entity);
        });`);
        expect(kernel.keys).toEqual(["mass", "target", "score"]);
        expect(String(kernel.create)).not.toMatch(/\bkeys\[/);
        expect(run(kernel, 1, { mass: { "[]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, 5],
            [2, 100], [2, 100, 1, 999], [2, 100, 2, 1],
            [1, 100],
        ]);
    });

    test("commands name components through keys", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [position] } }, (row, context) => {
            const { commands } = context;
            const spawned = commands.spawn([position, alive])({ [position]: [row[position][0], 1] });
            commands.add(spawned, score, row.entity);
            commands.add(spawned, alive);
            commands.remove(row.entity, [alive, score]);
            commands.remove(row.entity, mass);
        });`);
        expect(kernel.keys).toEqual(["position", "alive", "score", "mass"]);
        // Only position is given a tuple; registration checks such components are stored in linear memory.
        expect(kernel.structuredValues).toEqual([0]);
        // A component given no value is given undefined, which the runtime writes as the component's start.
        expect(run(kernel, 1, { position: { "[0]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, [5, 1]], ["spawn", 999, 1, undefined],
            [2, 999], [2, 999, 2, 100],
            [2, 999], [2, 999, 1, undefined],
            [3, 100], [3, 100, 1], [3, 100, 2],
            [3, 100], [3, 100, 3],
        ]);
    });

    test("commands name lists through module constants: array literals and Archetype.create", async () => {
        const kernel = await compile(`import { Archetype } from "ecs";
        const unit = Archetype.create([position, alive, score]);
        const pair = [mass, score];
        const kernel = System.create({ kernel: true, components: { read: [position] } }, (row, { commands }) => {
            const spawned = commands.spawn(unit)({ [score]: 2, [position]: [row[position][0], 1] });
            commands.add(spawned, pair, { [mass]: 3 });
            commands.remove(row.entity, unit);
        });`);
        expect(kernel.keys).toEqual(["position", "alive", "score", "mass"]);
        expect(kernel.structuredValues).toEqual([0]);
        expect(run(kernel, 1, { position: { "[0]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, [5, 1]], ["spawn", 999, 1, undefined], ["spawn", 999, 2, 2],
            [2, 999], [2, 999, 3, 3], [2, 999, 2, undefined],
            [3, 100], [3, 100, 0], [3, 100, 1], [3, 100, 2],
        ]);
    });

    test("kernel declarations list components through module constants", async () => {
        const kernel = await compile(`import { Archetype } from "ecs";
        const moving = Archetype.create([position, velocity]);
        const kernel = System.create({ kernel: true, components: { read: moving, write: [score] } }, row => {
            row[score] = row[position] + row[velocity];
        });`);
        expect(run(kernel, 2, { position: { "[]": [1, 2] }, velocity: { "[]": [10, 20] } }).field("score")).toEqual([11, 22]);
    });

    test.each([
        ["a value for a component the list doesn't name", "commands.spawn([mass])({ [mass]: 1, [score]: 2 });", "score isn't one of the command's components"],
        ["a spawner kept rather than called", "const spawn = commands.spawn([mass]); spawn({ [mass]: 1 });", "a kernel calls the spawner where it gets it, as commands.spawn(components)(values)"],
        ["a list holding a spread", "commands.spawn([...pair])({});", "commands.spawn: lists name keys by identifiers bound at module scope"],
        ["a list that isn't a module constant", "const list = 1; commands.add(row.entity, list, {});", "commands name components by identifiers bound at module scope"],
        ["a component listed twice", "commands.remove(row.entity, [mass, mass]);", "mass is listed twice"],
        ["an add with too many arguments", "commands.add(row.entity, mass, 1, 2);", "an add is commands.add(entity, component, value) or commands.add(entity, components, values)"],
        ["a remove with rest components", "commands.remove(row.entity, mass, score);", "a remove is commands.remove(entity, component) or commands.remove(entity, components)"],
    ])("fail the build for %s", async (_, body, message) => {
        expect(await failure(`const pair = [mass, score];\nconst kernel = System.create({ kernel: true, components: { read: [mass] } }, (row, { commands }) => { const m = row[mass]; ${body} });`)).toBe(message);
    });
});

describe("program", () => {
    test("input and resource paths are scalars in the program", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { write: [score] }, resources: { read: [delta] } }, (row, { resources: { [delta]: d } }, input) => {
            const [, y] = d;
            row[score] = y * input.scale + Math.max(input.scale, Math.PI) + (input.flag ? 1 : 0);
        });`);
        const result = run(kernel, 1, {}, { resources: [[1, 2]], args: { scale: 3, flag: true } });
        expect(result.field("score")).toEqual([2 * 3 + Math.PI + 1]);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"resource","index":0,"path":[1]}`);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"args","path":["scale"]}`);
    });

    test("runtime indexing into a resource has no program", async () => {
        const kernel = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] }, resources: { read: [delta] } }, (row, { resources: { [delta]: d } }) => {
            row[score] = d[row[mass]];
        });`);
        expect(run(kernel, 1, { mass: { "[]": [1] } }, { resources: [[5, 6]], program: false }).field("score")).toEqual([6]);
    });
});

describe("composites", () => {
    test("one argument to System.create that isn't a body is a composite, never a kernel", async () => {
        const result = await transform(`const a = System.create({}, () => {});
const listed = System.create([a]);
const declared = System.create({ kernel: true, systems: [a], components: { write: [score] } });`);
        expect(result !== null && "failure" in result ? result.failure.message : result?.kernels ?? []).toEqual([]);
    });
});

describe("lookups in the program", () => {
    const targets = (entity: number) => entity === 1 ? [3, [10, 20, 30]] : entity === 2 ? [4, [40, 50, 60]] : null;
    const declaration = (body: string, read = "[target]", lookup = "targets: { read: [mass, position] }") => `const kernel = System.create({ kernel: true,
        components: { read: ${read}, write: [score] }, lookup: { ${lookup} } },
        (row, { lookup: { ${lookup.includes("others") ? "targets, others" : "targets"} } }) => { ${body} });`;

    test("guarded leaf access, early return and a second lookup in its own handle", async () => {
        const kernel = await compile(declaration(`
            const other = targets(row[target]);
            if (other === null) return;
            const [tx, ty] = other[position];
            const second = others(row[mass]);
            const extra = second !== null ? second[position][2] : 0;
            row[score] = tx - other[mass] + ty * 0 + extra;
        `, "[target, mass]", "targets: { read: [mass, position] }, others: { read: [position] }"));
        expect(kernel.program?.handles).toBe(2);
        const others = (entity: number) => entity === 2 ? [[0, 0, 7]] : null;
        expect(run(kernel, 3, { target: { "[]": [1, 2, 3] }, mass: { "[]": [2, 0, 0] }, score: { "[]": [-1, -1, -1] } }, { lookups: [targets, others] }).field("score"))
            .toEqual([10 - 3 + 7, 40 - 4, -1]);
    });

    test("optional chains read NaN when nothing was found, anywhere", async () => {
        const kernel = await compile(declaration(`row[score] = targets(row[target])?.[position]?.[1] * 2;`, "[target]", "targets: { read: [position] }"));
        expect(kernel.program).not.toBeNull();
        expect(run(kernel, 2, { target: { "[]": [1, 5] } }, { lookups: [entity => targets(entity)?.slice(1) ?? null] }).field("score")).toEqual([40, NaN]);
    });

    test("guards through && and conditional tests", async () => {
        const kernel = await compile(declaration(`
            const other = targets(row[target]);
            row[score] = other && other[mass] > 3 ? other[position][0] : -other?.[mass];
        `));
        expect(kernel.program).not.toBeNull();
        expect(run(kernel, 3, { target: { "[]": [1, 2, 3] } }, { lookups: [targets, () => null] }).field("score")).toEqual([-3, 40, NaN]);
    });

    test.each([
        ["an unguarded leaf access", `const other = targets(row[target]); row[score] = other[mass];`, "targets: { read: [mass] }"],
        ["a lookup result used whole", `const other = targets(row[target]); row[score] = other;`, "targets: { has: [mass] }"],
        ["a leaf access after the guard's scope", `const other = targets(row[target]); if (other !== null) { row[score] = 1; } row[score] = other[mass];`, "targets: { read: [mass] }"],
    ])("no program for %s", async (_, body, lookup) => {
        const kernel = await compile(declaration(body, "[target]", lookup));
        expect(kernel.program).toBeNull();
    });
});

describe("subset", () => {
    const kernel = (body: string, components = "{ read: [mass], write: [score] }") =>
        `const kernel = System.create({ kernel: true, components: ${components} }, (row, { commands }) => { ${body} });`;

    test.each([
        ["row[mass] = 1;", "mass is not in components write"],
        ["row[score] = row[score] + row[mass];", "compiled"],
        ["const f = () => 1;", "functions can't be created in a kernel; define helpers at module scope"],
        ["row[score] = \"a\";", "only number, boolean and null literals are in the kernel subset"],
        ["var x = 1;", "use const or let, not var"],
        ["return 1;", "a kernel returns nothing; return ends the current row"],
        ["row[score] = new Float32Array(1)[0];", "NewExpression is not in the kernel subset"],
        ["row[score] = Math.random();", "Math.random is not in the kernel subset"],
        ["row[score] = mass;", "mass is a key; use it to index, as in row[mass]"],
        ["const v = [1, 2]; row[score] = v[row[mass]];", "tuple elements are indexed by an in-range literal"],
        ["let v = [1, 2]; v[0] = 3;", "values are immutable; assign a whole new value to a let local"],
    ])("%s", async (body, message) => {
        expect(await failure(kernel(body))).toBe(message);
    });

    test("component values are written whole", async () => {
        expect(await failure(kernel("row[position][0] = 1;", "{ write: [position] }"))).toBe("component values are immutable; write the whole value");
    });

    test("GPU kernels", async () => {
        const gpu = (declaration: string, body: string) =>
            `const kernel = System.create({ kernel: "gpu", ${declaration} }, (row, context) => { ${body} });`;
        expect(await failure(gpu("components: { read: [mass], write: [score] }", "row[score] = row[mass] * 2;"))).toBe("compiled");
        expect(await failure(gpu("components: { read: [target], write: [score] }, lookup: { targets: { read: [mass] } }", "row[score] = 1;")))
            .toBe("a GPU kernel can't use lookups yet");
        expect(await failure(gpu("components: { write: [score], changed: [mass] }", "row[score] = 1;"))).toBe("a GPU kernel can't use change filters yet");
        expect(await failure(gpu("components: { read: [mass], write: [score] }", "context.commands.despawn(row.entity);")))
            .toBe("a GPU kernel can't issue commands or use values that aren't numbers or booleans");
        expect(await failure(gpu("components: { read: [mass], write: [score] }", "let s = 0; for (let i = 0; i < 3; i++) s += i; row[score] = s;")))
            .toBe("a GPU kernel can't use loops or labeled blocks yet");
        expect(await failure(`const kernel = System.create({ kernel: "cpu", components: { write: [score] } }, (row) => {});`))
            .toBe(`kernel must be the literal true, false or "gpu"`);
    });

    test("GPU programs carry their locals' names", async () => {
        const body = "(row) => { const doubled = row[mass] * 2; row[score] = doubled; }";
        const gpu = await compile(`const kernel = System.create({ kernel: "gpu", components: { read: [mass], write: [score] } }, ${body});`);
        const cpu = await compile(`const kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, ${body});`);
        expect(gpu.program?.names).toEqual([expect.stringMatching(/^doubled_\d+$/)]);
        expect(cpu.program?.names).toBeUndefined();
    });

    test("kernels inside functions", async () => {
        expect(await failure(`const make = () => System.create({ kernel: true, components: { write: [score] } }, (row) => {});`))
            .toBe("kernel systems must be declared at module scope");
    });

    test("failures carry the offending position", async () => {
        const source = kernel("row[mass] = 1;");
        const result = await transform(source);
        const position = `${header}${source}`.indexOf("row[mass] = 1");
        expect(result !== null && "failure" in result ? result.failure.position : -1).toBe(position);
    });

    test("non-kernel systems that may reach their commands and other modules are left untouched", async () => {
        expect(await transform(`const s = System.create({ components: { read: [mass] } }, (row, context) => { const f = () => [row, context]; });`)).toBeNull();
        expect(await transformKernels(`import { System } from "other";\nSystem.create({ name: "a", kernel: true }, () => {});`, "/x.js", parse, async () => null, () => "")).toBeNull();
    });
});

describe("terminal bodies", () => {
    /** Whether the transform marks a main-thread system's body as one that never reaches its commands. */
    const marked = async (parameters: string, body: string, declaration = `{ name: "a" }`): Promise<boolean> => {
        const result = await transform(`const system = System.create(${declaration}, ${parameters} => { ${body} });`);
        if (result !== null && "failure" in result) throw new Error(result.failure.message);
        const code = result?.code ?? "";
        return code.includes("terminal$((") && code.includes("function terminal$(body)");
    };
    test.each([
        ["no context", "(row)", "console.log(row);", `{ name: "a", components: { has: [mass] } }`],
        ["a context destructured without commands", "({ resources })", "console.log(resources);", `{ name: "a" }`],
        ["a context used only through its other properties", "(context)", "console.log(context.resources);", `{ name: "a", resources: { read: [delta] } }`],
        ["a context reaching resources and lookups", "(row, context)", "console.log(context.resources, context.lookup, row);", `{ name: "a", components: { has: [mass] } }`],
        ["nested destructuring", "({ resources: { [delta]: d } })", "console.log(d);", `{ name: "a", resources: { read: [delta] } }`],
    ])("mark a body with %s", async (_, parameters, body, declaration) => {
        expect(await marked(parameters, body, declaration)).toBe(true);
    });
    test.each([
        ["destructured commands", "({ commands })", "commands.despawn(1);"],
        ["renamed commands", "({ commands: issue })", "issue.despawn(1);"],
        ["the context's commands", "(context)", "context.commands.despawn(1);"],
        ["the context's commands by a computed key", "(context)", `context["commands"].despawn(1);`],
        ["the context passed on", "(context)", "console.log(context);"],
        ["the context aliased", "(context)", "const c = context; console.log(c);"],
        ["a rest of the context", "({ ...rest })", "console.log(rest);"],
        ["a computed key of the context", "({ [score]: s })", "console.log(s);"],
        ["the context redeclared", "(context)", "{ const context = 1; console.log(context); }"],
        ["eval", "(context)", "eval('context.commands');"],
        ["a rest parameter", "(...parameters)", "console.log(parameters);"],
    ])("leave a body unmarked that reaches its commands through %s", async (_, parameters, body) => {
        expect(await marked(parameters, body)).toBe(false);
    });
    test("leave a function body unmarked that uses arguments", async () => {
        const result = await transform(`const system = System.create({}, function () { console.log(arguments); });`);
        expect(result).toBeNull();
    });
    test("mark a system made from its body alone, and no kernel or finalizer", async () => {
        const alone = await transform("const system = System.create(() => { console.log(1); });");
        expect(alone !== null && "code" in alone ? alone.code : "").toContain("System.create(terminal$(() =>");
        const kernel = await transform(`const kernel = System.create({ kernel: true, components: { write: [score] } }, (row) => { row[score] = 1; });`);
        expect(kernel !== null && "code" in kernel ? kernel.code : "").not.toContain("terminal$");
        const finalizer = await transformKernels(`import { Finalizer } from "ecs";\nconst f = Finalizer.create({ components: { read: [] } }, () => {});`, "/x.js", parse, async () => ownCopy, () => "");
        expect(finalizer).toBeNull();
    });
});

describe("index lookups in main-thread systems", () => {
    /** Runs the transformed body once, recording each lookup as the runtime hook receives it. */
    const looked = async (body: string, parameters = "({ lookup })", lookup = "near: { index: grid }"): Promise<{ readonly code: string; readonly calls: readonly unknown[] }> => {
        const source = `const grid = "grid";\nconst system = System.create({ lookup: { ${lookup} } }, ${parameters} => { ${body} });`;
        const result = await transform(source);
        if (result !== null && "failure" in result) return { code: result.failure.message, calls: [] };
        const module = (result?.code ?? `${header}${source}`).split("\n").filter(line => !line.startsWith("import ")).join("\n");
        const calls: unknown[] = [];
        const prepare = (shape: unknown) => ({ find: (lookup: unknown, ...values: unknown[]) => { calls.push(["site", shape, Reflect.apply(String, undefined, [lookup]), values]); return { length: 0 }; } });
        const system = new Function("System", "prepareLookup$", `${module}\nreturn system;`)({ create: (declaration: unknown, run: unknown) => ({ declaration, run }) }, prepare);
        const named = (name: string) => Object.assign((...values: unknown[]) => { calls.push(["call", name, values]); return { length: 0 }; }, { toString: () => name });
        system.run({ lookup: { near: named("near"), due: named("due"), other: named("other") } });
        return { code: result?.code ?? source, calls };
    };

    test("pass literal tuples and comparisons flattened, through a site of each call", async () => {
        const { calls } = await looked(`const x = 1; lookup.near([x, x + 1]); lookup.near([3, 4]); lookup.near(x); lookup.due(x, { ">=": x, "<": [x, 9] });`, "({ lookup })", "near: { index: grid }, due: { index: grid }");
        expect(calls).toEqual([["site", [2], "near", [1, 2]], ["site", [2], "near", [3, 4]], ["site", [0], "near", [1]], ["site", [0, [[">=", 0], ["<", 2]]], "due", [1, 1, 1, 9]]]);
    });

    test.each([
        ["the context's lookup", "context.lookup.near([1, 2]);", "(context)"],
        ["a destructured lookup", "near([1, 2]);", "({ lookup: { near } })"],
    ])("rewrite %s", async (_, body, parameters) => {
        const { calls } = await looked(body, parameters);
        expect(calls).toEqual([["site", [2], "near", [1, 2]]]);
    });

    test.each([
        ["a lookup by entity", "lookup.other(1);", "near: { index: grid }, other: { read: [] }"],
        ["a spread", "const key = [[1, 2]]; lookup.near(...key);", "near: { index: grid }"],
        ["a lookup kept", "const near = lookup.near; near([1, 2]);", "near: { index: grid }"],
        ["redeclared lookups", "{ const lookup = {}; } lookup.near([1, 2]);", "near: { index: grid }"],
        ["a call inside another's key", "lookup.near(lookup.near(1).length);", "near: { index: grid }"],
    ])("leave %s as written", async (_, body, lookup) => {
        const { calls } = await looked(body, "({ lookup })", lookup);
        expect(calls.some(call => Array.isArray(call) && call[0] === "call")).toBe(true);
    });
});

describe("commands in main-thread systems", () => {
    /** Runs the transformed system's body once, recording each spawn's and add's keys and values as the runtime hooks receive them. */
    const spawned = async (body: string, parameters = "({ commands })", declaration = `{ name: "a" }`): Promise<{ readonly code: string; readonly calls: readonly unknown[] }> => {
        const source = `const system = System.create(${declaration}, ${parameters} => { ${body} });`;
        const result = await transform(source);
        if (result !== null && "failure" in result) return { code: result.failure.message, calls: [] };
        const module = (result?.code ?? `${header}${source}`).split("\n").filter(line => !line.startsWith("import ")).join("\n");
        const calls: unknown[] = [];
        const prepare = (keys: () => readonly unknown[]) => ({
            begin: (_: unknown, components: unknown) => (...values: unknown[]) => { calls.push(["prepared", components, keys(), values]); return 0; },
            fallback: () => 0,
        });
        const prepareAdd = (keys: () => readonly unknown[]) => {
            let entity: unknown = undefined;
            let list: unknown = undefined;
            let values: unknown[] = [];
            return {
                begin: (_: unknown, target: unknown, components: unknown) => { entity = target; list = components; values = []; return true; },
                value: (k: number, value: unknown) => { values[k] = value; },
                end: () => { calls.push(["prepared add", list, keys(), entity, values]); },
                fallback: () => {},
            };
        };
        const system = new Function("System", "prepareSpawn$", "prepareAdd$", `${module}\nreturn system;`)({ create: (declaration: unknown, run: unknown) => ({ declaration, run }) }, prepare, prepareAdd);
        const context = { commands: { spawn: (list: unknown) => (values: unknown) => { calls.push(["spawn", list, values]); }, add: (entity: unknown, list: unknown, values: unknown) => { calls.push(["add", entity, list, values]); } } };
        if (parameters.startsWith("(row")) system.run({}, context);
        else system.run(context);
        return { code: result?.code ?? source, calls };
    };

    test("pass literal values positionally, in source order", async () => {
        const { calls } = await spawned(`let i = 0; commands.spawn([++i, score, mass])({ [position]: [++i, 0, 0], [score]: ++i, [mass]: 3 }); commands.spawn([])({});`);
        expect(calls).toEqual([["prepared", [1, "score", "mass"], ["position", "score", "mass"], [[2, 0, 0], 3, 3]], ["prepared", [], [], []]]);
    });

    test.each([
        ["a string literal key", `commands.spawn([score, mass])({ [score]: 1, "mass": 3 });`],
        ["a plain key", "commands.spawn([score, mass])({ [score]: 1, mass: 3 });"],
        ["a number key", "commands.spawn([score])({ 1: 3 });"],
    ])("fail the build for %s, since component keys are symbols", async (_, body) => {
        const { code, calls } = await spawned(body);
        expect(code).toBe("a command's keys are its components' symbols, as [key]; a plain or string key is never a component's");
        expect(calls).toEqual([]);
    });

    test.each([
        ["the context's commands", "context.commands.spawn([score])({ [score]: 1 });", "(context)", `{ name: "a" }`],
        ["renamed commands", "issue.spawn([score])({ [score]: 1 });", "({ commands: issue })", `{ name: "a" }`],
        ["a system with components", "commands.spawn([score])({ [score]: 1 });", "(row, { commands })", `{ name: "a", components: { has: [mass] } }`],
        ["the context of a system with components", "context.commands.spawn([score])({ [score]: 1 });", "(row, context)", `{ name: "a", components: { has: [mass] } }`],
    ])("pass values positionally through %s", async (_, body, parameters, declaration) => {
        const { calls } = await spawned(body, parameters, declaration);
        expect(calls).toEqual([["prepared", ["score"], ["score"], [1]]]);
    });

    test("pass values positionally in a system made from its body alone", async () => {
        const result = await transform("const system = System.create(({ commands }) => { commands.spawn([score])({ [score]: 1 }); });");
        expect(result !== null && "code" in result ? result.code : null).toContain("spawn$0(commands, [score], 1)");
    });

    test.each([
        ["a value object built first", "const values = { [score]: 1 }; commands.spawn([score])(values);"],
        ["a spread", "const values = { [score]: 1 }; commands.spawn([score, mass])({ ...values, [mass]: 2 });"],
        ["a key that isn't a module constant", "const key = score; commands.spawn([score])({ [key]: 1 });"],
        ["a shadowed key", "const score = \"other\"; commands.spawn([score])({ [score]: 1 });"],
        ["redeclared commands", "{ const commands = { spawn: () => {} }; } commands.spawn([score])({ [score]: 1 });"],
        ["a spawner kept", "const spawn = commands.spawn([score]); spawn({ [score]: 1 });"],
    ])("leave %s as written", async (_, body) => {
        const { calls } = await spawned(body);
        expect(calls.every(call => Array.isArray(call) && call[0] === "spawn")).toBe(true);
        expect(calls.length).toBe(1);
    });
    describe("adds", () => {
        test("pass literal values positionally, after the entity, in source order", async () => {
            const { code, calls } = await spawned("let i = 0; commands.add(++i, [score, mass, ++i], { [score]: ++i, [mass]: ++i });");
            expect(code).toContain("prepareAdd$");
            expect(calls).toEqual([["prepared add", ["score", "mass", 2], ["score", "mass"], 1, [3, 4]]]);
        });
        test.each([
            ["a value object built first", "const values = { [score]: 1 }; commands.add(1, [score], values);"],
            ["a spread", "const values = { [score]: 1 }; commands.add(1, [score, mass], { ...values, [mass]: 2 });"],
            ["a key that isn't a module constant", "const key = score; commands.add(1, [score], { [key]: 1 });"],
            ["one component", "commands.add(1, score, 1);"],
            ["one component's object value", `commands.add(1, score, { text: "a", "size": 2 });`],
        ])("leave %s as written", async (_, body) => {
            const { calls } = await spawned(body);
            expect(calls).toEqual([["add", 1, expect.anything(), expect.anything()]]);
        });
        test("fail the build for a plain or string key", async () => {
            expect((await spawned(`commands.add(1, [score, mass], { [score]: 1, "mass": 3 });`)).code).toBe("a command's keys are its components' symbols, as [key]; a plain or string key is never a component's");
        });
    });
});

describe("helpers that return early", () => {
    test("take each path's value, with later statements on the paths that fall through", async () => {
        const kernel = await compile(`const pick = (a, b) => {
            if (a > b) return [a, 0];
            const c = b * 2;
            if (c > 10) {
                const d = c - 10;
                return [d, 1];
            }
            return [c, 2];
        };
        const kernel = System.create({ kernel: true, components: { read: [mass], write: [position] } }, (row) => {
            const [value, path] = pick(row[mass], 4);
            row[position] = [value, path, 0];
        });`);
        const result = run(kernel, 3, { mass: { "[]": [5, 3, 1] }, position: vec3([0, 0, 0], [0, 0, 0], [0, 0, 0]) });
        expect([result.field("position", [0]), result.field("position", [1])]).toEqual([[5, 8, 8], [0, 2, 2]]);
    });
});

describe("math builtins", () => {
    const math = `import { Vec3, Quat, Mat4x4 } from "ecs";\n`;
    const points = vec3([1, -2, 0.5], [0, 3, 4], [2, 1, -1]);
    const at = (row: number): readonly [number, number, number] => [points["[0]"][row], points["[1]"][row], points["[2]"][row]];
    const results = (result: ReturnType<typeof run>) => [0, 1, 2].map(row => [0, 1, 2].map(k => result.field("position", [k])[row]));

    test("inline as scalar code, nested namespaces and helpers they call included", async () => {
        const kernel = await compile(`${math}const kernel = System.create({ kernel: true, components: { read: [velocity], write: [position, score] } }, (row) => {
            const p = row[position];
            const v = row[velocity];
            row[position] = Vec3.add(Vec3.normalize(Vec3.cross(p, v)), Vec3.F32.scale(Vec3.clamp(v, Vec3.zero, [1, 1, 1]), Vec3.dot(p, v)));
            row[score] = Vec3.distance(p, v) + Vec3.length(Vec3.mix(p, v, 0.25));
        });`);
        const result = run(kernel, 3, { position: points, velocity: vec3([0.5, 1, 2], [1, 0, -1], [3, -2, 0]) });
        const velocities: readonly (readonly [number, number, number])[] = [[0.5, 1, 3], [1, 0, -2], [2, -1, 0]];
        const expected = [0, 1, 2].map(row => {
            const p = at(row);
            const v = velocities[row];
            return Vec3.add(Vec3.normalize(Vec3.cross(p, v)), Vec3.scale(Vec3.clamp(v, Vec3.zero, [1, 1, 1]), Vec3.dot(p, v)));
        });
        expect(results(result)).toEqual(expected.map(value => [...value]));
        expect(result.field("score")).toEqual([0, 1, 2].map(row => Vec3.distance(at(row), velocities[row]) + Vec3.length(Vec3.mix(at(row), velocities[row], 0.25))));
        expect(String(kernel.create)).not.toMatch(/Vec3|normalize|cross/);
    });

    test("across namespaces: quaternions rotating vectors, and matrices", async () => {
        const kernel = await compile(`${math}const kernel = System.create({ kernel: true, components: { write: [position] } }, (row) => {
            const q = Quat.fromAxisAngle([0, 0, 1], Math.PI / 2);
            const m = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));
            row[position] = Mat4x4.multiplyVec3(m, Quat.rotateVec3(q, row[position]));
        });`);
        const result = run(kernel, 3, { position: points });
        const q = Quat.fromAxisAngle([0, 0, 1], Math.PI / 2);
        const m = Mat4x4.multiply(Mat4x4.translation(1, 2, 3), Mat4x4.scaling(2, 2, 2));
        expect(results(result)).toEqual([0, 1, 2].map(row => [...Mat4x4.multiplyVec3(m, Quat.rotateVec3(q, at(row)))]));
    });

    test("in GPU kernels, become regions WGSL emits as builtins, and other backends run as the inlined body", async () => {
        const body = `(row) => { row[position] = Vec3.scale(Vec3.normalize(Vec3.cross(row[position], row[velocity])), Vec3.dot(row[position], row[velocity])); }`;
        const declaration = `components: { read: [velocity], write: [position] }`;
        const gpu = await compile(`${math}const kernel = System.create({ kernel: "gpu", ${declaration} }, ${body});`);
        const cpu = await compile(`${math}const kernel = System.create({ kernel: true, ${declaration} }, ${body});`);
        const regions = (gpu.program?.body ?? []).flatMap(statement => statement.kind === "intrinsic" ? [statement.intrinsic.operation] : []);
        expect(regions).toEqual(["cross", "normalize", "dot", "*"]);
        expect((cpu.program?.body ?? []).some(statement => statement.kind === "intrinsic")).toBe(false);
        const fields = { position: points, velocity: vec3([0.5, 1, 2], [1, 0, -1], [3, -2, 0]) };
        expect(results(run(gpu, 3, fields))).toEqual(results(run(cpu, 3, fields)));
        const columns = gpu.columns.map((column): WasmColumn => ({ view: column.kind === "field" ? "f32" : "f64", stride: 4, offset: 0, boolean: false, component: 0 }));
        const shader = gpu.program === null ? "" : generateWgsl(gpu.program, columns, () => "number");
        const code = typeof shader === "string" ? shader : shader.code;
        expect(code).toMatch(/(normalize_\d+) = normalize\((cross_\d+)\);/);
        expect(code).toMatch(/= \(normalize_\d+ \* dot_\d+\);/);
    });

    test("that leave the kernel subset fail with the function's reason", async () => {
        expect(await failure(`${math}const kernel = System.create({ kernel: true, components: { write: [position] } }, (row) => {
            row[position] = Vec3.random();
        });`)).toBe("Math.random is not in the kernel subset");
        expect(await failure(`${math}const kernel = System.create({ kernel: true, components: { write: [position] } }, (row) => {
            row[position] = Vec3.missing([1, 2, 3]);
        });`)).toMatch(/^missing isn't exported by .*\/math\/vec3\/public\.ts$/);
    });
});

describe("imported functions and constants", () => {
    const kernel = (imports: string, body: string) => `${imports}\nconst kernel = System.create({ kernel: true, components: { read: [mass], write: [score] } }, (row) => { ${body} });`;
    const scores = async (source: string, files: { readonly [file: string]: string }) =>
        run(await compile(source, files), 2, { mass: { "[]": [2, 3] } }).field("score");

    test("inline through named, default, namespace and re-exported imports", async () => {
        const files = {
            "/shapes.js": "const TWO = 2;\nexport const twice = (x) => x * TWO;\nexport default function square(x) { return x * x; }\nexport const pair = (x) => [x, x + 1];",
            "/second.js": "const ONE = 1;\nexport const second = (v) => v[ONE];",
            "/barrel.js": "export { twice as double } from './shapes.js';\nexport * as Shapes from './shapes.js';\nexport * from './second.js';",
        };
        expect(await scores(kernel(`import square, { twice } from "./shapes.js";\nimport * as Barrel from "./barrel.js";`,
            "row[score] = square(twice(row[mass])) + Barrel.double(1) + Barrel.Shapes.default(3) + Barrel.second(Barrel.Shapes.pair(row[mass]));"), files))
            .toEqual([16 + 2 + 9 + 3, 36 + 2 + 9 + 4]);
    });

    test("report the files kernels inline from, also when they fail, so fixing them compiles again", async () => {
        const result = await transform(kernel(`import { twice } from "./shapes.js";`, "row[score] = twice(row[mass]);"), { "/shapes.js": "export const twice = (x) => x * 2;" });
        expect(result?.dependencies).toEqual(["/shapes.js"]);
        const failed = await transform(kernel(`import { twice } from "./shapes.js";`, "row[score] = twice(row[mass]);"), { "/shapes.js": "export const twice = (x) => x * Math.random();" });
        expect(failed !== null && "failure" in failed).toBe(true);
        expect(failed?.dependencies).toEqual(["/shapes.js"]);
    });

    test("that leave the subset fail at the call, with a frame for each inlined function", async () => {
        const source = kernel(`import { outer } from "./outer.js";`, "row[score] = outer(row[mass]);");
        const result = await transform(source, {
            "/outer.js": "import { inner } from './inner.js';\nexport const outer = (x) => inner(x) + 1;",
            "/inner.ts": "type Unused = {\n    readonly a: number;\n};\nexport const inner = (x: number): number =>\n    x * Math.random();",
        });
        const failure = result !== null && "failure" in result ? result.failure : undefined;
        expect(failure?.message).toBe("Math.random is not in the kernel subset");
        expect(failure?.position).toBe(`${header}${source}`.indexOf("outer(row[mass])"));
        expect(failure?.frames).toEqual([
            { name: "inner", file: "/inner.ts", line: 5, column: 9 },
            { name: "outer", file: "/outer.js", line: 2, column: 29 },
        ]);
    });

    test("frame each function of a module that fails inside another of its functions", async () => {
        const result = await transform(kernel(`import { outer } from "./outer.js";`, "row[score] = outer(row[mass]);"), {
            "/outer.js": "const inner = (x) => x * Math.random();\nexport const outer = (x) => inner(x) + 1;",
        });
        const failure = result !== null && "failure" in result ? result.failure : undefined;
        expect(failure?.frames).toEqual([
            { name: "inner", file: "/outer.js", line: 1, column: 26 },
            { name: "outer", file: "/outer.js", line: 2, column: 29 },
        ]);
    });

    test("fail on recursion across modules, module state, and names they can't resolve", async () => {
        expect(await failure(kernel(`import { even } from "./even.js";`, "row[score] = even(row[mass]);"), {
            "/even.js": "import { odd } from './odd.js';\nexport const even = (n) => n === 0 ? 1 : odd(n - 1);",
            "/odd.js": "import { even } from './even.js';\nexport const odd = (n) => n === 0 ? 0 : even(n - 1);",
        })).toBe("even is recursive");
        expect(await failure(kernel(`import { next } from "./counter.js";`, "row[score] = next();"), { "/counter.js": "let count = 0;\nexport const next = () => count;" }))
            .toBe("count is not a module-scope const");
        expect(await failure(kernel(`import { missing } from "./shapes.js";`, "row[score] = missing(1);"), { "/shapes.js": "export const twice = (x) => x * 2;" }))
            .toBe("missing isn't exported by /shapes.js");
        expect(await failure(kernel(`import { f } from "./both.js";`, "row[score] = f(1);"), {
            "/both.js": "export * from './a.js';\nexport * from './b.js';", "/a.js": "export const f = (x) => x;", "/b.js": "export const f = (x) => -x;",
        })).toBe("f is exported by more than one export * of /both.js");
        expect(await failure(kernel(`import { f } from "lodash";`, "row[score] = f(1);"))).toBe("lodash can't be resolved from /test.js");
    });
});

describe("imported lists", () => {
    const files = {
        "/components.js": `export const health = "health";\nexport const armor = "armor";\nexport const tagged = "tagged";\n`,
        "/archetypes.js": [
            `import { Archetype } from "ecs";`,
            `import { health, armor, tagged } from "./components.js";`,
            `export const shield = "shield";`,
            `export const Unit = Archetype.create([health, armor, tagged]);`,
            `export const Guard = [shield, armor];`,
            `export const Alias = Unit;`,
            `export const Computed = [health].concat([armor]);`,
            `export let Changing = [health];`,
            `export const Spread = [...Guard];`,
        ].join("\n"),
        "/barrel.js": `export { Unit as Soldier } from "./archetypes.js";\nexport * from "./archetypes.js";\nexport * as Kinds from "./archetypes.js";\n`,
    };
    /** The values the archetypes' module gives its lists, for evaluating the kernel's module. */
    const Unit = ["health", "armor", "tagged"];
    const Guard = ["shield", "armor"];
    const commanding = (imports: string, body: string) =>
        `${imports}\nconst kernel = System.create({ kernel: true, components: { read: [mass] } }, (row, { commands }) => { ${body} });`;

    test("name the keys of a list imported from another module, by the kernel's bindings or else through the list", async () => {
        const source = commanding(`import { health, armor } from "./components.js";\nimport { Unit, Guard } from "./archetypes.js";`, `
            const spawned = commands.spawn(Unit)({ [health]: row[mass], [armor]: 2 });
            commands.add(spawned, Guard, { [armor]: 3 });
            commands.remove(row.entity, Unit);`);
        const result = await transform(source, files);
        expect(result !== null && "code" in result ? result.code : "").toContain("keys: [health, armor, Unit[2], Guard[0]],");
        expect(result?.dependencies).toEqual(expect.arrayContaining(["/archetypes.js", "/components.js"]));
        const kernel = await compile(source, files, { health: "health", armor: "armor", Unit, Guard });
        expect(kernel.keys).toEqual(["health", "armor", "tagged", "shield"]);
        expect(run(kernel, 1, { mass: { "[]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, 5], ["spawn", 999, 1, 2], ["spawn", 999, 2, undefined],
            [2, 999], [2, 999, 3, undefined], [2, 999, 1, 3],
            [3, 100], [3, 100, 0], [3, 100, 1], [3, 100, 2],
        ]);
    });

    test("follow re-exports, namespace imports and constants naming another list", async () => {
        const source = commanding(`import { health } from "./components.js";\nimport { Soldier, Alias } from "./barrel.js";\nimport * as Archetypes from "./archetypes.js";\nimport * as Barrel from "./barrel.js";\nconst Local = Alias;`, `
            commands.spawn(Soldier)({ [health]: row[mass] });
            commands.spawn(Archetypes.Unit)({ [health]: 2 });
            commands.add(row.entity, Barrel.Kinds.Guard, {});
            commands.remove(row.entity, Local);`);
        const result = await transform(source, files);
        expect(result !== null && "code" in result ? result.code : result?.failure.message).toContain("keys: [health, Soldier[1], Soldier[2], Barrel.Kinds.Guard[0]],");
        const kernel = await compile(source, files, { health: "health", Soldier: Unit, Alias: Unit, Archetypes: { Unit, Guard }, Barrel: { Kinds: { Guard } } });
        expect(kernel.keys).toEqual(["health", "armor", "tagged", "shield"]);
        expect(run(kernel, 1, { mass: { "[]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, 5], ["spawn", 999, 1, undefined], ["spawn", 999, 2, undefined],
            ["spawn", 999], ["spawn", 999, 0, 2], ["spawn", 999, 1, undefined], ["spawn", 999, 2, undefined],
            [2, 100], [2, 100, 3, undefined], [2, 100, 1, undefined],
            [3, 100], [3, 100, 0], [3, 100, 1], [3, 100, 2],
        ]);
    });

    test("in a declaration, bind keys the list's module defines to the kernel's imports of them, under any name", async () => {
        const source = `import { shield, Guard } from "./archetypes.js";\nimport { armor as plate } from "./components.js";
const kernel = System.create({ kernel: true, components: { read: Guard, write: [score] } }, (row) => { row[score] = row[shield] * 10 + row[plate]; });`;
        const kernel = await compile(source, files, { shield: "shield", Guard, plate: "armor" });
        expect(run(kernel, 2, { shield: { "[]": [1, 2] }, armor: { "[]": [3, 4] } }).field("score")).toEqual([13, 24]);
        expect(await failure(`import { shield, Guard } from "./archetypes.js";
const kernel = System.create({ kernel: true, components: { read: Guard, write: [score] } }, (row) => { row[score] = row[shield]; });`, files))
            .toBe("Guard[1] is in components read but never read; remove it, or move it to components has to keep requiring it");
    });

    test.each([
        ["computed when its module runs", "commands.spawn(Computed)({});", "commands.spawn: Computed is computed when /archetypes.js runs, so the compiler can't read its components; declare it as an array literal, or Archetype.create of one"],
        ["not a const", "commands.spawn(Changing)({});", "commands.spawn: Changing isn't a module-scope const, so the compiler can't read its components"],
        ["holding a spread", "commands.spawn(Spread)({});", "commands.spawn: Spread names a key by something other than an identifier bound at the scope of /archetypes.js"],
        ["not exported", "commands.spawn(Missing)({});", "commands.spawn: Missing isn't exported by /archetypes.js"],
        ["a namespace", "commands.spawn(Archetypes)({});", "commands.spawn: Archetypes is a module namespace, not a list of components"],
        ["a member of a namespace it doesn't export", "commands.remove(row.entity, Archetypes.Missing);", "commands.remove: Missing isn't exported by /archetypes.js"],
    ])("fail the build for a list %s", async (_, body, message) => {
        expect(await failure(commanding(`import { Computed, Changing, Spread, Missing } from "./archetypes.js";\nimport * as Archetypes from "./archetypes.js";`, body), files)).toBe(message);
    });

    test("take an imported name as one key when it resolves to a key, followed through namespaces and constants", async () => {
        const keys = {
            ...files,
            "/keys.js": [
                `export const ember = Symbol("ember");`,
                `export const glow = identify$(Symbol("glow"), "keys.js#glow");`,
                `export const spark = ember;`,
                `function identify$(symbol, id) { return symbol; }`,
            ].join("\n"),
        };
        const source = commanding(`import { ember, glow, spark } from "./keys.js";\nimport * as Keys from "./keys.js";\nimport { heat } from "external";`, `
            commands.add(row.entity, ember, row[mass]);
            commands.add(row.entity, glow, true);
            commands.remove(row.entity, Keys.ember);
            commands.remove(row.entity, spark);
            commands.add(row.entity, heat, 2);`);
        const result = await transform(source, keys);
        expect(result !== null && "code" in result ? result.code : result?.failure.message).toContain("keys: [ember, glow, spark, heat],");
    });

    test.each([
        ["computed when its module runs", "commands.add(row.entity, Computed, {});", "commands.add: Computed is computed when /archetypes.js runs, so the compiler can't tell whether it's a key or a list; declare a key as Symbol(...), or a list as an array literal or Archetype.create of one"],
        ["not a const", "commands.remove(row.entity, Changing);", "commands.remove: Changing isn't a module-scope const, so the compiler can't tell whether it's a key or a list"],
        ["not exported", "commands.remove(row.entity, Missing);", "commands.remove: Missing isn't exported by /archetypes.js"],
        ["a namespace", "commands.add(row.entity, Archetypes, 1);", "commands.add: Archetypes is a module namespace, not a key or a list of components"],
        ["of a module that can't be resolved", "commands.add(row.entity, Lost, 1);", "commands.add: nowhere can't be resolved from /test.js"],
    ])("fail the build for an added or removed name %s", async (_, body, message) => {
        expect(await failure(commanding(`import { Computed, Changing, Missing } from "./archetypes.js";\nimport * as Archetypes from "./archetypes.js";\nimport { Lost } from "nowhere";`, body), files)).toBe(message);
    });

    test("fail the build for a list that names a key", async () => {
        expect(await failure(commanding(`import { health } from "./components.js";`, "commands.spawn(health)({});"), files))
            .toBe("commands.spawn: health is a key, not a list of components; list it as [health]");
    });

    test("fail the build for a declaration's list computed when its module runs", async () => {
        expect(await failure(`import { Computed } from "./archetypes.js";
const kernel = System.create({ kernel: true, components: { read: Computed, write: [score] } }, (row) => { row[score] = 1; });`, files))
            .toBe("components.read: Computed is computed when /archetypes.js runs, so the compiler can't read its components; declare it as an array literal, or Archetype.create of one");
    });
});

describe("declared access", () => {
    const kernel = (declaration: string, body: string) =>
        `const kernel = System.create({ kernel: true, ${declaration} }, (row, { resources, lookup, reduce }) => { ${body} });`;
    const system = (declaration: string, body: string) => `const system = System.create({ ${declaration} }, ${body});`;

    test("a kernel uses every component and resource it lists", async () => {
        expect(await failure(kernel("components: { read: [position, velocity], write: [score] }", "row[score] = row[velocity];")))
            .toBe("position is in components read but never read; remove it, or move it to components has to keep requiring it");
        expect(await failure(kernel("components: { read: [position], write: [velocity, mass] }", "row[velocity] = row[position];")))
            .toBe("mass is in components write but never written; remove it, or move it to components read if it's only read");
        expect(await failure(kernel("components: { write: [score] }, resources: { read: [delta] }", "row[score] = 1;")))
            .toBe("delta is in resources read but never read; remove it");
        expect(await failure(kernel("components: { read: [target], write: [score] }, lookup: { targets: { read: [mass, position] } }",
            "const found = lookup.targets(row[target]); row[score] = found === null ? 0 : found[mass];")))
            .toBe("position is in lookup.targets read but never read; remove it, or move it to lookup.targets has to keep requiring it");
        expect(await failure(kernel("components: { read: [mass], has: [alive] }", "const entity = row.entity;")))
            .toBe("mass is in components read but never read; remove it, or move it to components has to keep requiring it");
        expect(await failure(kernel("components: { read: [position, mass], write: [score] }, resources: { read: [delta] }",
            "row[score] = row[mass] * resources[delta] + row[position][0];"))).toBe("compiled");
    });

    test("a kernel reads every component it lists in up.read, and up holds only those", async () => {
        const up = (kind: string, read: string, body: string) =>
            `const kernel = System.create({ kernel: ${kind === "gpu" ? `"gpu"` : "true"}, components: { read: [mass], write: [score] }, up: { through: target, read: [${read}] } }, (row, { up }) => { ${body} });`;
        const propagate = "row[score] = (up === null ? 0 : up[score]) + row[mass];";
        expect(await failure(up("cpu", "score, position", propagate))).toBe("position is in up.read but never read; remove it");
        expect(await failure(up("cpu", "score", "row[score] = up === null ? row[mass] : up[position];"))).toBe("up is indexed by a component in up.read");
        expect(await failure(up("gpu", "score", propagate))).toBe("compiled");
        expect(await failure(up("cpu", "score", propagate))).toBe("compiled");
    });

    test("a main-thread system uses every component and resource it lists, where its body shows every access", async () => {
        const unread = "mass is in components read but never read; remove it, or move it to components has to keep requiring it";
        expect(await failure(system("components: { read: [position, mass], write: [velocity] }", "(row) => { row[velocity] = row[position]; }"))).toBe(unread);
        expect(await failure(system("components: { read: [position], write: [velocity] }", "(row) => { console.log(row[position]); }")))
            .toBe("velocity is in components write but never written; remove it, or move it to components read if it's only read");
        expect(await failure(system("components: { read: [mass] }", "() => {}"))).toBe(unread);
        expect(await failure(system("components: { read: [mass] }", "(row, { commands }) => commands.despawn(row.entity)"))).toBe(unread);
        expect(await failure(system("components: { write: [score] }", "(row) => { row[score] += 1; }"))).toBe("compiled");
    });

    test("a main-thread system uses every resource it lists, through its context's resources however it reaches them", async () => {
        const unread = "delta is in resources read but never read; remove it";
        // Without components, the context is the first parameter.
        expect(await failure(system("resources: { read: [delta], write: [score] }", "(context) => { context.resources[score] = 1; }"))).toBe(unread);
        expect(await failure(system("resources: { read: [delta], write: [score] }", "({ resources }) => { resources[score] = 1; }"))).toBe(unread);
        expect(await failure(system("resources: { read: [delta], write: [score] }", "(context) => { const { resources } = context; resources[score] = 1; }"))).toBe(unread);
        expect(await failure(system("resources: { read: [delta] }", "(_context, input) => { console.log(input); }"))).toBe(unread);
        expect(await failure(system("resources: { write: [score, mass] }", "({ resources }) => { resources[score] = 1; }"))).toBe("mass is in resources write but never written; remove it, or move it to resources read if it's only read");
        expect(await failure(system("components: { has: [mass] }, resources: { read: [delta], write: [score] }",
            "(_, context) => { context.resources[score] = context.resources[delta]; }"))).toBe("compiled");
        expect(await failure(system("resources: { read: [delta] }", "({ resources: { [delta]: d } }) => { console.log(d); }"))).toBe("compiled");
    });

    test("a system contributes to every resource it reduces", async () => {
        const totals = `const total = "total";\nconst low = "low";\n`;
        const missing = "low is in resources reduce but never contributed to; remove it";
        expect(await failure(`${totals}${kernel("components: { read: [mass] }, resources: { reduce: [total, low] }", "reduce[total](row[mass]);")}`)).toBe(missing);
        expect(await failure(`${totals}${system("components: { read: [mass] }, resources: { reduce: [total, low] }", "(row, { reduce }) => { reduce[total](row[mass]); }")}`)).toBe(missing);
        expect(await failure(`${totals}${system("components: { read: [mass] }, resources: { reduce: [total, low] }", "(row, context) => { context.reduce[total](row[mass]); }")}`)).toBe(missing);
        expect(await failure(`${totals}${system("components: { read: [mass] }, resources: { reduce: [total] }", "(row, { reduce }) => { const add = reduce[total]; add(row[mass]); }")}`)).toBe("compiled");
    });

    test("a main-thread system reads every component it lists in a lookup, where its body shows every use of the result", async () => {
        const looking = (lookup: string, body: string) => system(`components: { read: [target] }, lookup: { targets: { read: ${lookup} } }`, body);
        const unread = "position is in lookup.targets read but never read; remove it, or move it to lookup.targets has to keep requiring it";
        expect(await failure(looking("[mass, position]", "(row, context) => { const found = context.lookup.targets(row[target]); if (found !== null) console.log(found[mass]); }"))).toBe(unread);
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { console.log(lookup.targets(row[target])?.[mass]); }"))).toBe(unread);
        expect(await failure(looking("[mass, position]", "(row, { lookup: { targets } }) => { console.log(targets(row[target])?.[mass]); }"))).toBe(unread);
        expect(await failure(looking("[mass]", "(row, { lookup: { targets } }) => { const found = targets(row[target]); if (!found) return; console.log(found[mass]); }")))
            .toBe("compiled");
        expect(await failure(looking("[mass, position]", "(row, { lookup: { targets } }) => { const found = targets(row[target]); console.log(found); }"))).toBe("compiled");
        expect(await failure(looking("[mass, position]", "(row, { lookup: { targets } }) => { let found = targets(row[target]); console.log(found?.[mass]); }"))).toBe("compiled");
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { helper(lookup); console.log(row[target]); }"))).toBe("compiled");
    });

    test("a main-thread system reads every component it lists in a lookup through an index, from its lists' rows", async () => {
        const looking = (lookup: string, body: string) => system(`components: { read: [target] }, lookup: { near: { index: grid, read: ${lookup} } }`, body);
        const unread = "position is in lookup.near read but never read; remove it";
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { const near = lookup.near(row[target]); for (let i = 0; i < near.length; i++) console.log(near.at(i)[mass], near.changed); }"))).toBe(unread);
        expect(await failure(looking("[mass, position]", "(row, context) => { const other = context.lookup.near(row[target]).at(0); console.log(other[mass], other.entity); }"))).toBe(unread);
        expect(await failure(looking("[mass, position]", "(row, { lookup: { near } }) => { console.log(near(row[target])?.[mass]); }"))).toBe(unread);
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { const near = lookup.near(row[target]); console.log(near.at(0)[mass], near.at(1)[position]); }"))).toBe("compiled");
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { helper(lookup.near(row[target])); }"))).toBe("compiled");
        expect(await failure(looking("[mass, position]", "(row, { lookup }) => { const near = lookup.near(row[target]); const all = near.at; console.log(all); }"))).toBe("compiled");
    });

    test("a main-thread system reads every component it lists through a destructured row", async () => {
        const unread = "mass is in components read but never read; remove it, or move it to components has to keep requiring it";
        expect(await failure(system("components: { read: [position, mass] }", "({ [position]: p, entity }) => { console.log(p, entity); }"))).toBe(unread);
        expect(await failure(system("components: { read: [position, mass] }", "(row) => { const { [position]: p } = row; console.log(p); }"))).toBe(unread);
        expect(await failure(system("components: { read: [position] }", "({ ...all }) => { console.log(all); }"))).toBe("compiled");
    });

    test("finalizers are checked as main-thread bodies, in files that import only Finalizer", async () => {
        const finalizing = (source: string) => transformKernels(source, "/finalizer.js", parse, async specifier => specifier === "ecs" ? ownCopy : null, index => JSON.stringify(`kernel:${index}`));
        const failed = async (source: string) => {
            const result = await finalizing(source);
            return result !== null && "failure" in result ? result.failure.message : "compiled";
        };
        const header = `import { Finalizer } from "ecs";\nconst handle = "handle";\nconst count = "count";\n`;
        expect(await failed(`${header}const f = Finalizer.create({ components: { read: [handle, count] } }, (row) => { console.log(row[handle]); });`))
            .toBe("count is in components read but never read; remove it, or move it to components has to keep requiring it");
        expect(await failed(`${header}const f = Finalizer.changes({ resources: { read: [count] } }, (changes, { resources }) => { console.log(changes); });`))
            .toBe("count is in resources read but never read; remove it");
        expect(await failed(`${header}const f = Finalizer.changes({ resources: { read: [count] } }, (changes, { resources }) => { console.log(changes, resources[count]); });`))
            .toBe("compiled");
        expect(await failed(`${header}const f = Finalizer.create({ components: { read: [handle] } }, (row) => { console.log(row[handle]); });`)).toBe("compiled");
    });

    test("a list declared as a module constant is checked as its array literal", async () => {
        const moving = `const moving = [position, velocity];\n`;
        expect(await failure(`${moving}${system("components: { read: moving }", "(row) => { console.log(row[position]); }")}`))
            .toBe("velocity is in components read but never read; remove it, or move it to components has to keep requiring it");
        expect(await failure(`${moving}${system("components: { read: moving }", "(row) => { console.log(row[position], row[velocity]); }")}`)).toBe("compiled");
        expect(await failure(`${moving}${kernel("components: { read: moving, write: [score] }", "row[score] = row[position];")}`))
            .toBe("velocity is in components read but never read; remove it, or move it to components has to keep requiring it");
    });

    test("a main-thread system whose body hides an access isn't checked", async () => {
        expect(await failure(system("components: { read: [mass] }", "(row) => { helper(row); }"))).toBe("compiled");
        expect(await failure(system("components: { read: [mass] }", "(row) => { for (const key of [mass]) console.log(row[key]); }"))).toBe("compiled");
        expect(await failure(system("components: { read: [mass] }", "(row) => { const mass = \"other\"; console.log(row[mass]); }"))).toBe("compiled");
        expect(await failure(system("components: { read: [mass] }", "function (row) { console.log(arguments[0][mass]); }"))).toBe("compiled");
        expect(await failure(system("resources: { read: [delta] }", "({ ...all }) => { console.log(all); }"))).toBe("compiled");
        expect(await failure(system("resources: { read: [delta] }", "({ resources: { ...all } }) => { console.log(all); }"))).toBe("compiled");
        expect(await failure(system("resources: { read: [delta] }", "(context) => { helper(context.resources); }"))).toBe("compiled");
        expect(await failure(system("resources: { read: [delta] }", "(context) => { let r = context.resources; console.log(r); }"))).toBe("compiled");
        expect(await failure(system("components: { read: [mass] }", "body"))).toBe("compiled");
        expect(await failure("const decay = (k) => System.create({ name: \"a\", components: { read: [k] } }, (row) => { console.log(row[k]); });")).toBe("compiled");
    });
});
