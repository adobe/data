import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import type { KernelDescription } from '../world/create/kernel.js';
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

const transform = (source: string) => transformKernels(`${header}${source}`, "/test.js", parseAst, async specifier => specifier === "ecs");

/** Compiles `source`, which assigns its kernel system to `kernel`, and returns the attached description. */
const compile = async (source: string): Promise<KernelDescription> => {
    const result = await transform(source);
    if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
    const module = result.code.split("\n").filter(line => !line.startsWith("import ")).join("\n");
    const evaluate = new Function("System", "attachKernel$", `${module}\nreturn kernel;`);
    return evaluate({ create: (declaration: unknown, body: unknown) => ({ declaration, body }) }, (_: unknown, description: unknown) => description);
};

const failure = async (source: string): Promise<string> => {
    const result = await transform(source);
    return result !== null && "failure" in result ? result.failure.message : "compiled";
};

type Fields = { readonly [component: string]: { readonly [path: string]: readonly number[] } };
type Call = readonly [string, ...unknown[]];
type Options = {
    readonly resources?: readonly unknown[];
    readonly lookups?: readonly ((entity: number) => readonly unknown[] | null)[];
    readonly args?: unknown;
    readonly booleans?: readonly string[];
};

const tick = 7;

/** Runs a kernel over hand-built columns; `fields` maps a component to its leaves by JSON path. */
const run = (description: KernelDescription, rows: number, fields: Fields, options: Options = {}) => {
    const columns = description.columns.map(column => column.kind === "entity" ? Float64Array.from({ length: rows }, (_, row) => 100 + row)
        : column.kind === "changed" ? new Uint32Array(rows)
        : Float64Array.from(fields[String(column.component)]?.[JSON.stringify(column.path)] ?? new Array<number>(rows).fill(0)));
    const calls: Call[] = [];
    const commands = {
        spawn: (values: unknown) => { calls.push(["spawn", values]); return 999; },
        despawn: (entity: unknown) => { calls.push(["despawn", entity]); },
        add: (entity: unknown, values: unknown) => { calls.push(["add", entity, values]); },
        remove: (entity: unknown, ...keys: unknown[]) => { calls.push(["remove", entity, ...keys]); },
    };
    const booleans = description.columns.map(column => column.kind === "field" && (options.booleans ?? []).includes(String(column.component)));
    description.create(booleans)(columns, 0, rows, options.resources ?? [], options.lookups ?? [], description.keys, options.args, commands, tick);
    const index = (kind: string, component: string, path: readonly (number | string)[] = []) => description.columns.findIndex(column =>
        column.kind === kind && column.kind !== "entity" && column.component === component
        && (column.kind === "changed" || JSON.stringify(column.path) === JSON.stringify(path)));
    return {
        field: (component: string, path: readonly (number | string)[] = []) => [...columns[index("field", component, path)] ?? []],
        changed: (component: string) => [...columns[index("changed", component)] ?? []],
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
        const result = run(kernel, 2, { target: { "[]": [1, 2] }, position: { "[]": [0, 0] } }, { lookups: [found] });
        expect(result.field("position")).toEqual([7, 0]);
        expect(result.field("score")).toEqual([5, -1]);
    });

    test("optional lookup access, computed context destructuring and args", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, args: { type: "number" }, query: { read: [target], write: [score] }, resources: { read: [delta] }, lookup: { targets: { read: [mass] } } }, (row, { [delta]: d, targets, args }) => {
            row[score] = (targets(row[target])?.[mass] ?? 0) + d + args;
        });`);
        const found = (entity: number) => entity === 1 ? [3] : null;
        expect(run(kernel, 2, { target: { "[]": [1, 2] } }, { lookups: [found], resources: [10], args: 100 }).field("score")).toEqual([113, 110]);
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
        const result = run(kernel, 2, { alive: { "[]": [1, 0] }, mass: { "[]": [3, 4] } }, { booleans: ["alive"] });
        expect(result.field("score")).toEqual([17, 28]);
        expect(result.calls).toEqual([["spawn", { alive: true, mass: 3 }], ["spawn", { alive: false, mass: 4 }]]);
        const source = String(kernel.create);
        // Converted: the snapshot of `flag` (observed through `copy ===` and spawn) and `mass` in the spawn value.
        expect(source.match(/ \? c\d+\[i\] !== 0/g)?.length).toBe(2);
        expect(source.match(/booleans\[/g)?.length).toBe(2);
    });

    test("commands name components through keys", async () => {
        const kernel = await compile(`const kernel = System.create({ name: "a", kernel: true, query: { read: [position] } }, (row, context, commands) => {
            const spawned = commands.spawn({ [position]: [row[position][0], 1], [alive]: true });
            commands.add(spawned, { [score]: row.entity });
            commands.remove(row.entity, alive, score);
        });`);
        expect(kernel.keys).toEqual(["position", "alive", "score"]);
        expect(run(kernel, 1, { position: { "[0]": [5] } }).calls).toEqual([
            ["spawn", { position: [5, 1], alive: true }],
            ["add", 999, { score: 100 }],
            ["remove", 100, "alive", "score"],
        ]);
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
        expect(await transformKernels(`import { System } from "other";\nSystem.create({ name: "a", kernel: true }, () => {});`, "/x.js", parseAst, async () => false)).toBeNull();
    });
});
