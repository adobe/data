// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Node, ObjectExpression } from 'estree';
import { bind } from './bind.js';
import { expression } from './expression.js';
import { fail } from './failure.js';
import type { Link } from './link.js';
import { createLists } from './lists.js';
import type { Module } from './module-scope.js';
import { resolve, type Out } from './out.js';
import { localName, printStatements } from './print.js';
import { toProgram } from './program.js';
import { serialize } from './serialize.js';
import { unconditionalChunks } from './stamps.js';
import { blockShift, chunkShift, type Program } from '../world/kernel.js';
import { rootScope } from './scope.js';
import { signature } from './signature.js';
import { rowLabel, statement } from './statement.js';
import { createUnit } from './unit.js';
import type { Value } from './value.js';

/** A kernel body takes its row, its context and its input, the run's arguments. */
const parameterValues: readonly Value[] = [{ kind: "row" }, { kind: "context" }, { kind: "dynamic", expression: { kind: "args", path: [] } }];

/**
 * One compiled kernel: `description(url)` is the source of its `KernelDescription`, with keys as the declaration's
 * identifiers and `program` lowered from the same statements as the JS; `create` is the source of
 * `KernelModule.create`, which references no module bindings and uses `keys[k]` only as opaque property keys.
 */
export type CompiledKernel = { readonly description: (url: string) => string; readonly create: string };

/**
 * Statements a GPU kernel can't contain: WGSL has no labeled multi-level branches, and loops aren't supported yet.
 * Intrinsic regions emit their builtin, not their body.
 */
const loops = (statements: readonly Program.Statement[]): boolean => statements.some(statement => {
    switch (statement.kind) {
        case "block": case "loop": case "branch": case "branchIf": case "find": return true;
        case "if": return loops(statement.consequent) || loops(statement.alternate);
        default: return false;
    }
});

/** `target` "gpu" also checks, before anything runs, what only a GPU kernel can't do; schemas are checked at registration. */
export const compileKernel = (declaration: ObjectExpression, body: Node, module: Module, target: "cpu" | "gpu" = "cpu", link: Link | null = null, tried = false): CompiledKernel => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") {
        return fail(body, "a kernel body must be an inline function");
    }
    if (body.async || body.generator) return fail(body, "a kernel body can't be async or a generator");
    if (body.params.length > 3) return fail(body, "a kernel body takes its row, context and input");
    const lists = createLists(module, link, [declaration, body]);
    const unit = createUnit(signature(declaration, module.bindings, lists), module, lists, expression, statement, link, target, tried);
    const scope = rootScope(unit, false);
    const prelude: Out = [];
    const rows: Out = [];
    body.params.forEach((param, index) => bind(param, parameterValues[index] ?? { kind: "row" }, "const", scope, index === 0 ? rows : prelude));
    if (body.body.type === "BlockStatement") {
        for (const item of body.body.body) statement(item, scope, rows);
    } else {
        statement({ type: "ExpressionStatement", expression: body.body, start: body.body.start, end: body.body.end }, scope, rows);
    }
    const statements = [...resolve(prelude), ...resolve(rows)];
    for (const [chunks, perCall] of unconditionalChunks(resolve(rows))) unit.stampedPerCall.set(chunks, perCall);
    const kernel = printStatements(unit, resolve(rows));
    // Which optional components a call's archetype has is the same for every row, so a kernel with them runs loops
    // specialized for all present and all absent, and the general one only for archetypes with some of them.
    const specialized = unit.presences.size === 0 ? null : ([true, false] as const).map(present => {
        unit.presentAs = present;
        const body = printStatements(unit, resolve(rows));
        unit.presentAs = null;
        return body;
    });
    const preludeCode = printStatements(unit, resolve(prelude));
    const accumulators = unit.accumulators.map(entry => entry.local);
    const { signature: { resources, lookups, up, ordered, filtered, reduced }, columns, booleans, keys } = unit;
    /** Whether it runs a list of rows, which needn't be consecutive: `up`'s depth order, or an index's. */
    const listed = up !== null || ordered;
    // WASM doesn't read components an archetype may lack yet, so such a kernel runs as JS.
    // WASM reads a lookup's rows only where every component it reads is there.
    const program = (unit.optionalColumns.size + unit.presences.size > 0 && listed) || unit.signature.lookups.some(lookup => lookup.optional) ? null : toProgram(statements, target === "gpu" ? local => localName(unit, local) : undefined, accumulators, unit.up, listed);
    if (target === "gpu") {
        if (lookups.length > 0) fail(declaration, "a GPU kernel can't use lookups yet");
        if (filtered) fail(declaration, "a GPU kernel can't use change filters yet");
        if (reduced.length > 0) fail(declaration, "a GPU kernel can't use reductions yet");
        if (program === null) fail(body, "a GPU kernel can't issue commands or use values that aren't numbers or booleans");
        else if (loops(program.body)) fail(body, "a GPU kernel can't use loops or labeled blocks yet");
    }
    // Chunk, block and presence columns aren't read at a row's element.
    const strided = columns.flatMap((column, index) => unit.chunks.has(index) || unit.blocks.has(index) || column.startsWith("{ kind: \"present\"") ? [] : [index]);
    const locals = [
        ...columns.map((_, index) => `const c${index} = columns[${index}];`),
        // Whether this call's archetype has each optional component, whose column is empty where it doesn't.
        ...[...unit.presences.values()].map(index => `const q${index} = c${index}.length !== 0;`),
        ...resources.map((_, index) => `const r${index} = resources[${index}];`),
        ...lookups.map((_, index) => `const l${index} = lookups[${index}];`),
        ...unit.spawns.map((_, index) => `const spawn${index} = commands.spawners[${index}];`),
        // A call's rows share one parent archetype, whose columns `up` reads at each row's parent row `p`.
        ...unit.up === null ? [] : [
            `const ${localName(unit, unit.up)} = found ? true : null;`,
            ...unit.upColumns.map((_, index) => `const u${index} = upColumns[${index}];`),
        ],
    ];
    const presences = [...unit.presences.values()];
    /** The row loop around a body. */
    const loop = (body: string): string => [
        listed
            ? `${rowLabel}: for (let n = start; n < end; n++) { const i = rows[n], p = parents[n]; ${[...strided.map(index => `const x${index} = i * s${index} + o${index};`), ...[...unit.stampedPerCall].map(([chunks, { blocks, when }]) => `${when === null ? "" : `if (q${when}) `}{ c${blocks}[i >> ${blockShift}] = tick; c${chunks}[i >> ${chunkShift}] = tick; }`)].join(" ")}`
            : `${rowLabel}: for (let ${["i = start", ...strided.map(index => `x${index} = start * s${index} + o${index}`)].join(", ")}; i < end; ${["i++", ...strided.map(index => `x${index} += s${index}`)].join(", ")}) {`,
        body,
        "}",
    ].join("\n");
    return {
        description: url => [
            "{",
            `columns: [${columns.join(", ")}],`,
            `shapes: [${[...unit.shapes].join(", ")}],`,
            `resources: [${resources.join(", ")}],`,
            `lookups: [${lookups.map(lookup => JSON.stringify(lookup.name)).join(", ")}],`,
            ...unit.probes.length === 0 ? [] : [`probes: [${unit.probes.join(", ")}],`, `rowLeaves: [${unit.rowLeaves.join(", ")}],`],
            ...up === null ? [] : ["up: true,", `upColumns: [${unit.upColumns.join(", ")}],`],
            ...ordered ? ["ordered: true,"] : [],
            `keys: [${keys.join(", ")}],`,
            `spawns: ${JSON.stringify(unit.spawns)},`,
            `structuredValues: ${JSON.stringify([...unit.structuredValues].map(name => unit.keys.indexOf(name)).sort((a, b) => a - b))},`,
            `url: ${url},`,
            `program: ${serialize(program)},`,
            `reducedShapes: [${[...unit.reducedShapes].join(", ")}],`,
            ...unit.tried ? [] : ["storagePrecision: true,"],
            `reductions: [${unit.accumulators.map(entry => {
                const { resource, operator } = reduced[entry.reduced] ?? fail(declaration, "unknown reduction");
                return `{ resource: ${resource}, operator: ${JSON.stringify(operator)}, path: ${JSON.stringify(entry.path)} }`;
            }).join(", ")}],`,
            "}",
        ].join("\n"),
        // Per-registration constants live in the closure. Each column's element index `i * s + o` is strength-reduced to
        // an induction variable in the loop update, which `continue rows` still runs.
        create: [
            "(booleans, strides, offsets, upBooleans, upStrides, upOffsets, labels) => {",
            ...[...booleans].map(index => `const b${index} = booleans[${index}];`),
            ...unit.optionalColumns.size + unit.presences.size === 0 ? [] : [
                "const absent = k => { throw new Error(`An entity lacks \"${labels[k]}\", optional in its system: add it with commands.add rather than assigning it.`); };",
            ],
            ...[...unit.upBooleans].map(index => `const ub${index} = upBooleans[${index}];`),
            ...unit.upColumns.map((_, index) => `const us${index} = upStrides[${index}], uo${index} = upOffsets[${index}];`),
            ...strided.map(index => `const s${index} = strides[${index}], o${index} = offsets[${index}];`),
            // Each lookup through an index's site holds its list and rows in handles its reader fills, made once.
            ...[...unit.handles].map(handle => `const ${localName(unit, handle)} = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, g: 0, h: 0 };`),
            "return (columns, start, end, resources, lookups, keys, args, commands, tick, partials, partial, rows, parents, upColumns, found) => {",
            ...locals,
            preludeCode,
            ...accumulators.map((local, k) => `let ${localName(unit, local)} = partials[partial + ${k}];`),
            // A kernel that runs a list of rows, which needn't be consecutive, stamps each row's own block and chunk.
            ...listed ? [] : [...unit.stampedPerCall].flatMap(([chunks, { blocks, when }]) => [
                `if (${when === null ? "" : `q${when} && `}start < end) for (let k = start >> ${blockShift}, last = (end - 1) >> ${blockShift}; k <= last; k++) c${blocks}[k] = tick;`,
                `if (${when === null ? "" : `q${when} && `}start < end) for (let k = start >> ${chunkShift}, last = (end - 1) >> ${chunkShift}; k <= last; k++) c${chunks}[k] = tick;`,
            ]),
            ...specialized === null ? [loop(kernel)] : [
                `if (${presences.map(index => `q${index}`).join(" && ")}) {`, loop(specialized[0]),
                `} else if (${presences.map(index => `!q${index}`).join(" && ")}) {`, loop(specialized[1]),
                "} else {", loop(kernel), "}",
            ],
            ...accumulators.map((local, k) => `partials[partial + ${k}] = ${localName(unit, local)};`),
            "};",
            "}",
        ].filter(line => line !== "").join("\n"),
    };
};
