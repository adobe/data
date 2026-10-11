import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { chunkShift, type KernelDescription, type KernelModule, type Program } from '../world/create/kernel.js';
import { transformKernels } from './transform.js';

const header = `import { System } from "ecs";
const position = "position";
const velocity = "velocity";
const mass = "mass";
const alive = "alive";
const score = "score";
const delta = "delta";
const target = "target";
`;

const transform = (source: string) => transformKernels(`${header}${source}`, "/test.js", parseAst, async specifier => specifier === "ecs",
    index => JSON.stringify(`kernel:${index}`));

type Compiled = KernelDescription & KernelModule;

/** Compiles `source`, which assigns its kernel system to `kernel`: the attached description plus its kernel module's `create`. */
const compile = async (source: string): Promise<Compiled> => {
    const result = await transform(source);
    if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
    const module = result.code.split("\n").filter(line => !line.startsWith("import ")).join("\n");
    const evaluate = new Function("System", "attachKernel$", `${module}\nreturn kernel;`);
    const description: KernelDescription = evaluate({ create: (declaration: unknown, body: unknown) => ({ declaration, body }) }, (_: unknown, attached: unknown) => attached);
    const index = Number(description.url.slice("kernel:".length));
    const kernelModule: KernelModule = new Function(`${result.kernels[index]?.replace("export const create =", "const create =")}\nreturn { create };`)();
    expect(kernelModule.create.toString()).not.toMatch(/\b(position|velocity|mass|alive|score|delta|target)\b/);
    return { ...description, ...kernelModule };
};

const failure = async (source: string): Promise<string> => {
    const result = await transform(source);
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
    lookups: readonly ((entity: number) => readonly unknown[] | null)[]): void => {
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
                case "find": {
                    const lookup = lookups[statement.lookup];
                    if (lookup === undefined) throw new Error(`no lookup ${statement.lookup}`);
                    handles[statement.handle] = lookup(Number(evaluate(statement.entity)));
                    return normal;
                }
            }
        };
        execute(program.body);
    }
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
    description.create(booleans, layout.strides, layout.offsets)(columns, start, end, options.resources ?? [], options.lookups ?? [], description.keys, options.args, commands, tick);
    expect(description.program !== null).toBe(options.program ?? true);
    if (description.program !== null) {
        const interpreted = build();
        interpret(description.program, interpreted, booleans, layout, start, end, options.resources ?? [], options.args, options.lookups ?? []);
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
        chunks: (component: string) => [...columns[index("chunks", component)] ?? []],
        calls,
    };
};

const vec3 = (x: readonly number[], y: readonly number[], z: readonly number[]) => ({ "[0]": x, "[1]": y, "[2]": z });

describe("particles", () => {
    test("gravity and integrate", async () => {
        const gravity = await compile(`const kernel = System.create({
            name: "particles/gravity", kernel: true,
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
            name: "particles/integrate", kernel: true,
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [velocity, alive], write: [velocity] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] } }, (row) => {
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
        const always = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] } }, (row) => {
            row[score] = row[mass];
        });`);
        expect(String(always.create)).not.toContain(">> 10] = tick");
        expect(run(always, 3200, {}, { range: [1000, 2100] }).chunks("score")).toEqual([tick, tick, tick, 0]);
        const after = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] } }, (row) => {
            if (row[mass] > 0) return;
            row[score] = 1;
        });`);
        expect(String(after.create)).toContain("[i >> 10] = tick");
        const mass = Array.from({ length: 3200 }, (_, row) => row >= 1024 && row < 2048 ? 1 : 0);
        expect(run(after, 3200, { mass: { "[]": mass } }, { range: [1000, 2100] }).chunks("score")).toEqual([tick, 0, tick, 0]);
    });

    test("indices stay in step when return skips the rest of a row", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [velocity], write: [velocity] } }, (row) => {
            const [x, y, z] = row[velocity];
            if (x > 1 && x < 5) return;
            row[velocity] = [z, y, x];
        });`);
        const result = run(kernel, 3, { velocity: vec3([1, 4, 7], [2, 5, 8], [3, 6, 9]) }, { interleaved: { velocity: { stride: 4, offsets: { "[0]": 1, "[1]": 2, "[2]": 3 } } } });
        expect(result.array("velocity")).toEqual([padding, 3, 2, 1, padding, 4, 5, 6, padding, 9, 8, 7]);
        expect(result.changed("velocity")).toEqual([tick, 0, tick]);
    });
});

describe("binding identity", () => {
    test("a local shadowing a component key is not that component", async () => {
        expect(await failure(`const kernel = System.create({ name: "a", kernel: true, query: { read: [velocity], write: [position] } }, (row) => {
            const velocity = 1;
            row[position] = row[velocity];
        });`)).toBe("row is indexed by a component in query read or write, or .entity");
    });

    test("another binding with the same key string is not the declared component", async () => {
        expect(await failure(`const speed = "velocity";
        const kernel = System.create({ name: "a", kernel: true, query: { read: [velocity], write: [position] } }, (row) => {
            row[position] = row[speed];
        });`)).toBe("speed is not in query read or write");
    });

    test("a helper parameter shadows a module binding only inside the helper", async () => {
        const kernel = await compile(`const twice = (velocity) => velocity * 2;
        const kernel = System.create({ name: "a", kernel: true, query: { read: [velocity], write: [position] } }, (row) => {
            row[position] = twice(row[velocity]) + row[velocity];
        });`);
        expect(run(kernel, 1, { velocity: { "[]": [3] } }).field("position")).toEqual([9]);
    });
});

describe("value semantics", () => {
    test("tuple locals are copies, and snapshots read before later writes", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [position] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: true, query: { read: [position], write: [position, score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: true, query: { write: [score] } }, (row) => { row[score] = f(1); });`))
            .toBe("f is recursive");
    });
});

describe("control flow", () => {
    test("return ends the row, also from inside a loop", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] } }, (row) => {
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
        const kernel = System.create({ name: "a", kernel: true, query: { read: [target], write: [position, score] }, lookup: { targets: { read: [mass, position] } } }, (row, { targets }) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, args: { type: "number" }, query: { read: [target], write: [score] }, resources: { read: [delta] }, lookup: { targets: { read: [mass] } } }, (row, { [delta]: d, targets, args }) => {
            row[score] = (targets(row[target])?.[mass] ?? 0) + d + args;
        });`);
        const found = (entity: number) => entity === 1 ? [3] : null;
        expect(run(kernel, 2, { target: { "[]": [1, 2] } }, { lookups: [found], resources: [10], args: 100, program: false }).field("score")).toEqual([113, 110]);
    });

    test("boolean columns read as booleans", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [alive], write: [score] } }, (row) => {
            row[score] = row[alive] === true ? 1 : 2;
        });`);
        expect(run(kernel, 2, { alive: { "[]": [1, 0] } }, { booleans: ["alive"] }).field("score")).toEqual([1, 2]);
        expect(run(kernel, 1, { alive: { "[]": [1] } }).field("score")).toEqual([2]);
    });

    test("boolean reads convert only where observable, including through locals", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [alive, mass], write: [score] } }, (row, context, commands) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass] } }, (row, context, commands) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [position] } }, (row, context, commands) => {
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
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, args: { type: "object" }, query: { write: [score] }, resources: { read: [delta] } }, (row, { [delta]: d, args }) => {
            const [, y] = d;
            row[score] = y * args.scale + Math.max(args.scale, Math.PI) + (args.flag ? 1 : 0);
        });`);
        const result = run(kernel, 1, {}, { resources: [[1, 2]], args: { scale: 3, flag: true } });
        expect(result.field("score")).toEqual([2 * 3 + Math.PI + 1]);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"resource","index":0,"path":[1]}`);
        expect(JSON.stringify(kernel.program)).toContain(`{"kind":"args","path":["scale"]}`);
    });

    test("runtime indexing into a resource has no program", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [mass], write: [score] }, resources: { read: [delta] } }, (row, { [delta]: d }) => {
            row[score] = d[row[mass]];
        });`);
        expect(run(kernel, 1, { mass: { "[]": [1] } }, { resources: [[5, 6]], program: false }).field("score")).toEqual([6]);
    });
});

describe("lookups in the program", () => {
    const targets = (entity: number) => entity === 1 ? [3, [10, 20, 30]] : entity === 2 ? [4, [40, 50, 60]] : null;
    const declaration = (body: string) => `const kernel = System.create({ name: "a", kernel: true,
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
        `const kernel = System.create({ name: "a", kernel: true, query: ${query} }, (row, context, commands) => { ${body} });`;

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

    test("imported helpers", async () => {
        expect(await failure(`import { helper } from "./helper.js";\n${kernel("row[score] = helper(1);")}`))
            .toBe("helper is imported; kernels can only use helpers and constants defined in this module");
    });

    test("kernels inside functions", async () => {
        expect(await failure(`const make = () => System.create({ name: "a", kernel: true, query: { write: [score] } }, (row) => {});`))
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
        expect(await transformKernels(`import { System } from "other";\nSystem.create({ name: "a", kernel: true }, () => {});`, "/x.js", parseAst, async () => false, () => "")).toBeNull();
    });
});
