import type { Node, ObjectExpression } from 'estree';
import { bind } from './bind.js';
import { expression } from './expression.js';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';
import { resolve, type Out } from './out.js';
import { printStatements } from './print.js';
import { toProgram } from './program.js';
import { serialize } from './serialize.js';
import { unconditionalChunks } from './stamps.js';
import { chunkShift, type Program } from '../world/create/kernel.js';
import { rootScope } from './scope.js';
import { signature } from './signature.js';
import { rowLabel, statement } from './statement.js';
import { createUnit } from './unit.js';
import type { Value } from './value.js';

const parameterValues: readonly Value[] = [{ kind: "row" }, { kind: "context" }, { kind: "commands" }];

/**
 * One compiled kernel: `description(url)` is the source of its `KernelDescription`, with keys as the declaration's
 * identifiers and `program` lowered from the same statements as the JS; `create` is the source of
 * `KernelModule.create`, which references no module bindings and uses `keys[k]` only as opaque property keys.
 */
export type CompiledKernel = { readonly description: (url: string) => string; readonly create: string };

/** Statements a GPU kernel can't contain: WGSL has no labeled multi-level branches, and loops aren't supported yet. */
const loops = (statements: readonly Program.Statement[]): boolean => statements.some(statement => {
    switch (statement.kind) {
        case "block": case "loop": case "branch": case "branchIf": case "find": return true;
        case "if": return loops(statement.consequent) || loops(statement.alternate);
        default: return false;
    }
});

/** `target` "gpu" also checks, before anything runs, what only a GPU kernel can't do; schemas are checked at registration. */
export const compileKernel = (declaration: ObjectExpression, body: Node, module: ModuleScope, target: "cpu" | "gpu" = "cpu"): CompiledKernel => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") {
        return fail(body, "a kernel body must be an inline function");
    }
    if (body.async || body.generator) return fail(body, "a kernel body can't be async or a generator");
    if (body.params.length > 3) return fail(body, "a kernel body takes row, context and commands");
    const unit = createUnit(signature(declaration, module), module, expression, statement);
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
    for (const chunks of unconditionalChunks(resolve(rows))) unit.stampedPerCall.add(chunks);
    const kernel = printStatements(unit, resolve(rows));
    const preludeCode = printStatements(unit, resolve(prelude));
    const program = toProgram(statements);
    const { signature: { resources, lookups, filtered }, columns, booleans, keys } = unit;
    if (target === "gpu") {
        if (lookups.length > 0) fail(declaration, "a GPU kernel can't use lookups yet");
        if (filtered) fail(declaration, "a GPU kernel can't use change filters yet");
        if (program === null) fail(body, "a GPU kernel can't issue commands or use values that aren't numbers or booleans");
        else if (loops(program.body)) fail(body, "a GPU kernel can't use loops or labeled blocks yet");
    }
    const strided = columns.flatMap((_, index) => unit.chunks.has(index) ? [] : [index]);
    const locals = [
        ...columns.map((_, index) => `const c${index} = columns[${index}];`),
        ...resources.map((_, index) => `const r${index} = resources[${index}];`),
        ...lookups.map((_, index) => `const l${index} = lookups[${index}];`),
    ];
    return {
        description: url => [
            "{",
            `columns: [${columns.join(", ")}],`,
            `shapes: [${[...unit.shapes].join(", ")}],`,
            `resources: [${resources.join(", ")}],`,
            `lookups: [${lookups.map(lookup => JSON.stringify(lookup.name)).join(", ")}],`,
            `keys: [${keys.join(", ")}],`,
            `url: ${url},`,
            `program: ${serialize(program)},`,
            "}",
        ].join("\n"),
        // Per-registration constants live in the closure. Each column's element index `i * s + o` is strength-reduced to
        // an induction variable in the loop update, which `continue rows` still runs.
        create: [
            "(booleans, strides, offsets) => {",
            ...[...booleans].map(index => `const b${index} = booleans[${index}];`),
            ...strided.map(index => `const s${index} = strides[${index}], o${index} = offsets[${index}];`),
            "return (columns, start, end, resources, lookups, keys, args, commands, tick) => {",
            ...locals,
            preludeCode,
            ...[...unit.stampedPerCall].map(chunks =>
                `if (start < end) for (let k = start >> ${chunkShift}, last = (end - 1) >> ${chunkShift}; k <= last; k++) c${chunks}[k] = tick;`),
            `${rowLabel}: for (let ${["i = start", ...strided.map(index => `x${index} = start * s${index} + o${index}`)].join(", ")}; i < end; ${["i++", ...strided.map(index => `x${index} += s${index}`)].join(", ")}) {`,
            kernel,
            "}",
            "};",
            "}",
        ].filter(line => line !== "").join("\n"),
    };
};
