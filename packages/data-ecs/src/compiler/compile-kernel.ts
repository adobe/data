import type { Node, ObjectExpression } from 'estree';
import { bind } from './bind.js';
import { plainReads } from './booleans.js';
import { expression } from './expression.js';
import { fail } from './failure.js';
import type { ModuleScope } from './module-scope.js';
import { render, type Out } from './out.js';
import { rootScope } from './scope.js';
import { signature } from './signature.js';
import { rowLabel, statement } from './statement.js';
import { createUnit } from './unit.js';
import type { Value } from './value.js';

const parameterValues: readonly Value[] = [{ kind: "row" }, { kind: "context" }, { kind: "commands" }];

/**
 * Compiles one kernel system to the source of its `KernelDescription`. Keys in the description are the
 * declaration's identifiers; `create` references no module bindings.
 */
export const compileKernel = (declaration: ObjectExpression, body: Node, module: ModuleScope): string => {
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
    const kernel = plainReads(render(rows));
    const preludeCode = plainReads(render(prelude));
    const { signature: { resources, lookups }, columns, booleans, keys } = unit;
    const locals = [
        ...columns.map((_, index) => `const c${index} = columns[${index}];`),
        ...[...booleans].map(index => `const b${index} = booleans[${index}];`),
        ...resources.map((_, index) => `const r${index} = resources[${index}];`),
        ...lookups.map((_, index) => `const l${index} = lookups[${index}];`),
        ...keys.map((_, index) => `const k${index} = keys[${index}];`),
    ];
    return [
        "{",
        `columns: [${columns.join(", ")}],`,
        `shapes: [${[...unit.shapes].join(", ")}],`,
        `resources: [${resources.join(", ")}],`,
        `lookups: [${lookups.map(lookup => JSON.stringify(lookup.name)).join(", ")}],`,
        `keys: [${keys.join(", ")}],`,
        "create: (booleans) => (columns, start, end, resources, lookups, keys, args, commands, tick) => {",
        ...locals,
        preludeCode,
        `${rowLabel}: for (let i = start; i < end; i++) {`,
        kernel,
        "}",
        "}",
        "}",
    ].filter(line => line !== "").join("\n");
};
