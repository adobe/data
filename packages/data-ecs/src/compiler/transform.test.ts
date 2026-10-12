/// <reference types="node" />
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { chunkShift, type KernelDescription, type KernelModule, type Program } from '../world/create/kernel.js';
import { transformKernels } from './transform.js';
import { createLinker, type LinkHost } from './link.js';
import { packageIndex } from './paths.js';
import { locateThroughMap } from './source-map.js';
import { Mat4x4, Quat, Vec3 } from '../math/index.js';
import { generateWgsl } from '../world/create/wgsl.js';
import { identityOf } from '../world/create/reductions.js';
import type { WasmColumn } from '../world/create/wasm.js';

const header = `import { System } from "ecs";
const position = "position";
const velocity = "velocity";
const mass = "mass";
const alive = "alive";
const score = "score";
const delta = "delta";
const target = "target";
`;

/** Modules by absolute path, for tests of imports: real files for anything not in `files`, and "ecs" for the package. */
const host = (files: { readonly [file: string]: string }): LinkHost => ({
    resolve: async (specifier, importer) => {
        if (specifier === "ecs") return packageIndex;
        if (!specifier.startsWith(".")) return { error: `${specifier} can't be resolved from ${importer}` };
        const path = resolve(dirname(importer), specifier);
        const typescript = path.replace(/\.js$/, ".ts");
        return files[typescript] !== undefined || (files[path] === undefined && existsSync(typescript)) ? typescript : path;
    },
    load: async file => {
        const code = files[file] ?? await readFile(file, "utf8");
        if (!file.endsWith(".ts")) return { code };
        const { transformWithEsbuild } = await import("vite");
        const result = await transformWithEsbuild(code, file, { loader: "ts", sourcemap: true });
        return { code: result.code, locate: locateThroughMap(result.code, result.map.mappings) };
    },
});

const transform = (source: string, files: { readonly [file: string]: string } = {}) => transformKernels(`${header}${source}`, "/test.js", parseAst,
    async specifier => specifier === "ecs", index => JSON.stringify(`kernel:${index}`), createLinker(host(files), parseAst));

type Compiled = KernelDescription & KernelModule;

/** Compiles `source`, which assigns its kernel system to `kernel`: the attached description plus its kernel module's `create`. */
const compile = async (source: string, files: { readonly [file: string]: string } = {}): Promise<Compiled> => {
    const result = await transform(source, files);
    if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
    const module = result.code.split("\n").filter(line => !line.startsWith("import ")).join("\n");
    const evaluate = new Function("System", "attachKernel$", `${module}\nreturn kernel;`);
    const description: KernelDescription = evaluate({ create: (declaration: unknown, body: unknown) => ({ declaration, body }) }, (_: unknown, attached: unknown) => attached);
    const index = Number(description.url.slice("kernel:".length));
    const kernelModule: KernelModule = new Function(`${result.kernels[index]?.replace("export const create =", "const create =")}\nreturn { create };`)();
    expect(kernelModule.create.toString()).not.toMatch(/\b(position|velocity|mass|alive|score|delta|target)\b/);
    return { ...description, ...kernelModule };
};

const failure = async (source: string, files: { readonly [file: string]: string } = {}): Promise<string> => {
    const result = await transform(source, files);
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
                    if (column) column[at(statement.column, row)] = tick;
                    if (chunks) chunks[row >> chunkShift] = tick;
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
        spawn: () => { current = ["spawn", 999]; calls.push(current); return 999; },
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

describe("particles", () => {
    test("gravity and integrate", async () => {
        const gravity = await compile(`const kernel = System.create({
            name: "particles/gravity", kernel: "cpu",
            query: { read: [velocity], write: [velocity] }, resources: { read: [delta] },
        }, (row, context) => {
            const [x, y, z] = row[velocity];
            row[velocity] = [x, y - 9.8 * context[delta], z];
        });`);
        const fallen = run(gravity, 2, { velocity: vec3([1, 2], [0, 10], [3, 4]) }, { resources: [0.5] });
        expect([fallen.field("velocity", [0]), fallen.field("velocity", [1]), fallen.field("velocity", [2])]).toEqual([[1, 2], [-4.9, 5.1], [3, 4]]);
        expect(fallen.changed("velocity")).toEqual([tick, tick]);
        expect(gravity.shapes).toEqual([{ component: "velocity", leaves: [[0], [1], [2]] }]);
        expect(gravity.resources).toEqual(["delta"]);

        const integrate = await compile(`const kernel = System.create({
            name: "particles/integrate", kernel: "cpu",
            query: { read: [position, velocity], write: [position] }, resources: { read: [delta] }, after: ["particles/gravity"],
        }, (row, context) => {
            const [px, py, pz] = row[position];
            const [vx, vy, vz] = row[velocity];
            const t = context[delta];
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [velocity, alive], write: [velocity] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => {
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
        const always = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => {
            row[score] = row[mass];
        });`);
        expect(String(always.create)).not.toContain(">> 10] = tick");
        expect(run(always, 3200, {}, { range: [1000, 2100] }).chunks("score")).toEqual([tick, tick, tick, 0]);
        const after = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => {
            if (row[mass] > 0) return;
            row[score] = 1;
        });`);
        expect(String(after.create)).toContain("[i >> 10] = tick");
        const mass = Array.from({ length: 3200 }, (_, row) => row >= 1024 && row < 2048 ? 1 : 0);
        expect(run(after, 3200, { mass: { "[]": mass } }, { range: [1000, 2100] }).chunks("score")).toEqual([tick, 0, tick, 0]);
    });

    test("indices stay in step when return skips the rest of a row", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [velocity], write: [velocity] } }, (row) => {
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
    const reducing = (reduce: string, body: string) => `const total = "total";
const low = "low";
const bits = "bits";
const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position, mass] }, resources: { reduce: { ${reduce} } } }, (row, context) => { ${body} });`;
    const fields = { position: vec3([1, -4, 2], [5, 0, -1], [3, 9, 6]), mass: { "[]": [2, 3, 12] } };

    test("fold each contribution into its resource, leaf by leaf, from the partial", async () => {
        const kernel = await compile(reducing(`[total]: "+", [low]: "min", [bits]: "|"`, `
            const [x, y, z] = row[position];
            context[total](row[mass]);
            context[total](1);
            context[low]([x, y, z]);
            context[bits](row[mass]);
        `));
        const result = run(kernel, 3, fields);
        expect(result.reduced("total")).toBe(2 + 3 + 12 + 3);
        expect([0, 1, 2].map(k => result.reduced("low", [k]))).toEqual([-4, -1, 3]);
        expect(result.reduced("bits")).toBe(2 | 3 | 12);
        expect(kernel.reductions.map(reduction => reduction.operator)).toEqual(["+", "min", "min", "min", "|"]);
    });

    test("fold the values of inlined functions", async () => {
        const kernel = await compile(`import { Vec3 } from "ecs";\n${reducing(`[low]: "max"`, "context[low](Vec3.scale(row[position], 2));")}`);
        expect([0, 1, 2].map(k => run(kernel, 3, fields).reduced("low", [k]))).toEqual([4, 10, 18]);
    });

    test("that can't be compiled fail with the reason", async () => {
        expect(await failure(reducing(`[total]: "+"`, "context[total](1, 2);"))).toBe("total takes the one value it reduces");
        expect(await failure(reducing(`[total]: "avg"`, "context[total](1);"))).toBe(`a resource is reduced with one of "+", "*", "min", "max", "&", "|", "^"`);
        expect(await failure(reducing(`total: "+"`, "context[total](1);"))).toBe(`resources.reduce names each resource as a computed key bound at module scope, as in { [total]: "+" }`);
        expect(await failure(reducing(`[total]: "+"`, "context[total](1);").replace(`kernel: "cpu"`, `kernel: "gpu"`))).toBe("a GPU kernel can't use reductions yet");
        expect(await failure(reducing(`[total]: "+"`, "context[total](1);").replace("resources: {", "resources: { read: [total],"))).toBe("total is reduced, so it can't also be read or filtered on");
        expect(await failure(reducing(`[total]: "+", [total]: "max"`, "context[total](1);"))).toBe("total is reduced twice");
    });
});

describe("let locals of component values", () => {
    test("written back whole after a tuple assignment have the tuple's shape", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position, alive], write: [position] } }, (row) => {
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
        expect(await failure(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [velocity], write: [position] } }, (row) => {
            const velocity = 1;
            row[position] = row[velocity];
        });`)).toBe("row is indexed by a component in query read or write, or .entity");
    });

    test("another binding with the same key string is not the declared component", async () => {
        expect(await failure(`const speed = "velocity";
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [velocity], write: [position] } }, (row) => {
            row[position] = row[speed];
        });`)).toBe("speed is not in query read or write");
    });

    test("a helper parameter shadows a module binding only inside the helper", async () => {
        const kernel = await compile(`const twice = (velocity) => velocity * 2;
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [velocity], write: [position] } }, (row) => {
            row[position] = twice(row[velocity]) + row[velocity];
        });`);
        expect(run(kernel, 1, { velocity: { "[]": [3] } }).field("position")).toEqual([9]);
    });
});

describe("value semantics", () => {
    test("tuple locals are copies, and snapshots read before later writes", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [position] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: "cpu", query: { write: [score] } }, (row) => { row[score] = f(1); });`))
            .toBe("f is recursive");
    });
});

describe("control flow", () => {
    test("return ends the row, also from inside a loop", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [target], write: [position, score] }, lookup: { targets: { read: [mass, position] } } }, (row, { targets }) => {
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

    test("optional lookup access, computed context destructuring and args", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", args: { type: "number" }, query: { read: [target], write: [score] }, resources: { read: [delta] }, lookup: { targets: { read: [mass] } } }, (row, { [delta]: d, targets, args }) => {
            row[score] = (targets(row[target])?.[mass] ?? 0) + d + args;
        });`);
        const found = (entity: number) => entity === 1 ? [3] : null;
        expect(run(kernel, 2, { target: { "[]": [1, 2] } }, { lookups: [found], resources: [10], args: 100, program: false }).field("score")).toEqual([113, 110]);
    });

    test("boolean columns read as booleans", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [alive], write: [score] } }, (row) => {
            row[score] = row[alive] === true ? 1 : 2;
        });`);
        expect(run(kernel, 2, { alive: { "[]": [1, 0] } }, { booleans: ["alive"] }).field("score")).toEqual([1, 2]);
        expect(run(kernel, 1, { alive: { "[]": [1] } }).field("score")).toEqual([2]);
    });

    test("boolean reads convert only where observable, including through locals", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [alive, mass], write: [score] } }, (row, context, commands) => {
            const flag = row[alive];
            const copy = flag;
            row[score] = (copy === true ? 10 : 20) + row[mass] * 2 + (flag ? 1 : 0);
            commands.spawn({ [alive]: flag, [mass]: row[mass] });
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass] } }, (row, context, commands) => {
            commands.add(row.entity, { [target]: commands.spawn({ [mass]: row[mass] }), [score]: 1 });
            commands.despawn(row.entity);
        });`);
        expect(kernel.keys).toEqual(["target", "mass", "score"]);
        expect(String(kernel.create)).not.toMatch(/\bkeys\[/);
        expect(run(kernel, 1, { mass: { "[]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 1, 5],
            [2, 100], [2, 100, 0, 999], [2, 100, 2, 1],
            [1, 100],
        ]);
    });

    test("commands name components through keys", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position] } }, (row, context, commands) => {
            const spawned = commands.spawn({ [position]: [row[position][0], 1], [alive]: true });
            commands.add(spawned, { [score]: row.entity });
            commands.remove(row.entity, alive, score);
        });`);
        expect(kernel.keys).toEqual(["position", "alive", "score"]);
        expect(run(kernel, 1, { position: { "[0]": [5] } }, { program: false }).calls).toEqual([
            ["spawn", 999], ["spawn", 999, 0, [5, 1]], ["spawn", 999, 1, true],
            [2, 999], [2, 999, 2, 100],
            [3, 100], [3, 100, 1], [3, 100, 2],
        ]);
    });
});

describe("program", () => {
    test("args and resource paths are scalars in the program", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", args: { type: "object" }, query: { write: [score] }, resources: { read: [delta] } }, (row, { [delta]: d, args }) => {
            const [, y] = d;
            row[score] = y * args.scale + Math.max(args.scale, Math.PI) + (args.flag ? 1 : 0);
        });`);
        const result = run(kernel, 1, {}, { resources: [[1, 2]], args: { scale: 3, flag: true } });
        expect(result.field("score")).toEqual([2 * 3 + Math.PI + 1]);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"resource","index":0,"path":[1]}`);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"args","path":["scale"]}`);
    });

    test("runtime indexing into a resource has no program", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] }, resources: { read: [delta] } }, (row, { [delta]: d }) => {
            row[score] = d[row[mass]];
        });`);
        expect(run(kernel, 1, { mass: { "[]": [1] } }, { resources: [[5, 6]], program: false }).field("score")).toEqual([6]);
    });
});

describe("lookups in the program", () => {
    const targets = (entity: number) => entity === 1 ? [3, [10, 20, 30]] : entity === 2 ? [4, [40, 50, 60]] : null;
    const declaration = (body: string) => `const kernel = System.create({ name: "a", kernel: "cpu",
        query: { read: [target, mass], write: [score] }, lookup: { targets: { read: [mass, position] }, others: { read: [position] } } },
        (row, { targets, others }) => { ${body} });`;

    test("guarded leaf access, early return and a second lookup in its own handle", async () => {
        const kernel = await compile(declaration(`
            const other = targets(row[target]);
            if (other === null) return;
            const [tx, ty] = other[position];
            const second = others(row[mass]);
            const extra = second !== null ? second[position][2] : 0;
            row[score] = tx - other[mass] + ty * 0 + extra;
        `));
        expect(kernel.program?.handles).toBe(2);
        const others = (entity: number) => entity === 2 ? [[0, 0, 7]] : null;
        expect(run(kernel, 3, { target: { "[]": [1, 2, 3] }, mass: { "[]": [2, 0, 0] }, score: { "[]": [-1, -1, -1] } }, { lookups: [targets, others] }).field("score"))
            .toEqual([10 - 3 + 7, 40 - 4, -1]);
    });

    test("optional chains read NaN when nothing was found, anywhere", async () => {
        const kernel = await compile(declaration(`row[score] = targets(row[target])?.[position]?.[1] * 2;`));
        expect(kernel.program).not.toBeNull();
        expect(run(kernel, 2, { target: { "[]": [1, 5] } }, { lookups: [targets, () => null] }).field("score")).toEqual([40, NaN]);
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
        ["an unguarded leaf access", `const other = targets(row[target]); row[score] = other[mass];`],
        ["a lookup result used whole", `const other = targets(row[target]); row[score] = other;`],
        ["a leaf access after the guard's scope", `const other = targets(row[target]); if (other !== null) { row[score] = 1; } row[score] = other[mass];`],
    ])("no program for %s", async (_, body) => {
        const kernel = await compile(declaration(body));
        expect(kernel.program).toBeNull();
    });
});

describe("subset", () => {
    const kernel = (body: string, query = "{ read: [mass], write: [score] }") =>
        `const kernel = System.create({ name: "a", kernel: "cpu", query: ${query} }, (row, context, commands) => { ${body} });`;

    test.each([
        ["row[mass] = 1;", "mass is not in query write"],
        ["row[score] = row[score] + 1;", "score is write-only here; add it to query read to read it"],
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
        expect(await failure(kernel("row[position][0] = 1;", "{ read: [position], write: [position] }"))).toBe("component values are immutable; write the whole value");
    });

    test("GPU kernels", async () => {
        const gpu = (declaration: string, body: string) =>
            `const kernel = System.create({ name: "a", kernel: "gpu", ${declaration} }, (row, context, commands) => { ${body} });`;
        expect(await failure(gpu("query: { read: [mass], write: [score] }", "row[score] = row[mass] * 2;"))).toBe("compiled");
        expect(await failure(gpu("query: { read: [target], write: [score] }, lookup: { targets: { read: [mass] } }", "row[score] = 1;")))
            .toBe("a GPU kernel can't use lookups yet");
        expect(await failure(gpu("query: { write: [score], changed: [mass] }", "row[score] = 1;"))).toBe("a GPU kernel can't use change filters yet");
        expect(await failure(gpu("query: { read: [mass], write: [score] }", "commands.despawn(row.entity);")))
            .toBe("a GPU kernel can't issue commands or use values that aren't numbers or booleans");
        expect(await failure(gpu("query: { read: [mass], write: [score] }", "let s = 0; for (let i = 0; i < 3; i++) s += i; row[score] = s;")))
            .toBe("a GPU kernel can't use loops or labeled blocks yet");
        expect(await failure(`const kernel = System.create({ name: "a", kernel: true, query: { write: [score] } }, (row) => {});`))
            .toBe(`kernel must be the literal "cpu" or "gpu"`);
    });

    test("GPU programs carry their locals' names", async () => {
        const body = "(row) => { const doubled = row[mass] * 2; row[score] = doubled; }";
        const gpu = await compile(`const kernel = System.create({ name: "a", kernel: "gpu", query: { read: [mass], write: [score] } }, ${body});`);
        const cpu = await compile(`const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, ${body});`);
        expect(gpu.program?.names).toEqual([expect.stringMatching(/^doubled_\d+$/)]);
        expect(cpu.program?.names).toBeUndefined();
    });

    test("kernels inside functions", async () => {
        expect(await failure(`const make = () => System.create({ name: "a", kernel: "cpu", query: { write: [score] } }, (row) => {});`))
            .toBe("kernel systems must be declared at module scope");
    });

    test("failures carry the offending position", async () => {
        const source = kernel("row[mass] = 1;");
        const result = await transform(source);
        const position = `${header}${source}`.indexOf("row[mass] = 1");
        expect(result !== null && "failure" in result ? result.failure.position : -1).toBe(position);
    });

    test("non-kernel systems and other modules are left untouched", async () => {
        expect(await transform(`const s = System.create({ name: "a", query: { read: [mass] } }, (row) => { const f = () => row; });`)).toBeNull();
        expect(await transformKernels(`import { System } from "other";\nSystem.create({ name: "a", kernel: "cpu" }, () => {});`, "/x.js", parseAst, async () => false, () => "")).toBeNull();
    });
});

describe("spawns in main-thread systems", () => {
    /** Runs the transformed system's body once, recording each spawn's keys and values as the runtime hook receives them. */
    const spawned = async (body: string): Promise<{ readonly code: string; readonly calls: readonly unknown[] }> => {
        const source = `const system = System.create({ name: "a" }, (row, context, commands) => { ${body} });`;
        const result = await transform(source);
        if (result !== null && "failure" in result) return { code: result.failure.message, calls: [] };
        const module = (result?.code ?? `${header}${source}`).split("\n").filter(line => !line.startsWith("import ")).join("\n");
        const calls: unknown[] = [];
        const prepare = (keys: () => readonly unknown[]) => {
            let values: unknown[] = [];
            return {
                begin: () => { values = []; return 0; },
                writers: Array.from({ length: 8 }, (_, k) => (__: number, value: unknown) => { values[k] = value; return true; }),
                end: () => { calls.push(["prepared", keys(), values]); return 0; },
                fallback: () => 0,
            };
        };
        const system = new Function("System", "prepareSpawn$", `${module}\nreturn system;`)({ create: (declaration: unknown, run: unknown) => ({ declaration, run }) }, prepare);
        system.run(undefined, {}, { spawn: (values: unknown) => { calls.push(["spawn", values]); } });
        return { code: result?.code ?? source, calls };
    };

    test("pass literal values positionally, in source order", async () => {
        const { calls } = await spawned(`let i = 0; commands.spawn({ [position]: [++i, 0, 0], [score]: ++i, "mass": 3 }); commands.spawn({});`);
        expect(calls).toEqual([["prepared", ["position", "score", "mass"], [[1, 0, 0], 2, 3]], ["prepared", [], []]]);
    });

    test.each([
        ["a value object built first", "const values = { [score]: 1 }; commands.spawn(values);"],
        ["a spread", "const values = { [score]: 1 }; commands.spawn({ ...values, [mass]: 2 });"],
        ["a key that isn't a module constant", "const key = score; commands.spawn({ [key]: 1 });"],
        ["a shadowed key", "const score = \"other\"; commands.spawn({ [score]: 1 });"],
        ["redeclared commands", "{ const commands = { spawn: () => {} }; } commands.spawn({ [score]: 1 });"],
    ])("leave %s as written", async (_, body) => {
        const { calls } = await spawned(body);
        expect(calls.every(call => Array.isArray(call) && call[0] === "spawn")).toBe(true);
        expect(calls.length).toBe(1);
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
        const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [position] } }, (row) => {
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
        const kernel = await compile(`${math}const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position, velocity], write: [position, score] } }, (row) => {
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
        const kernel = await compile(`${math}const kernel = System.create({ name: "a", kernel: "cpu", query: { read: [position], write: [position] } }, (row) => {
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
        const declaration = `query: { read: [position, velocity], write: [position] }`;
        const gpu = await compile(`${math}const kernel = System.create({ name: "a", kernel: "gpu", ${declaration} }, ${body});`);
        const cpu = await compile(`${math}const kernel = System.create({ name: "a", kernel: "cpu", ${declaration} }, ${body});`);
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
        expect(await failure(`${math}const kernel = System.create({ name: "a", kernel: "cpu", query: { write: [position] } }, (row) => {
            row[position] = Vec3.random();
        });`)).toBe("Math.random is not in the kernel subset");
        expect(await failure(`${math}const kernel = System.create({ name: "a", kernel: "cpu", query: { write: [position] } }, (row) => {
            row[position] = Vec3.missing([1, 2, 3]);
        });`)).toMatch(/^missing isn't exported by .*\/math\/vec3\/public\.ts$/);
    });
});

describe("imported functions and constants", () => {
    const kernel = (imports: string, body: string) => `${imports}\nconst kernel = System.create({ name: "a", kernel: "cpu", query: { read: [mass], write: [score] } }, (row) => { ${body} });`;
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
