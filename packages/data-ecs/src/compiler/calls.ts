import type { SimpleCallExpression, Expression, Node, SpreadElement } from 'estree';
import { bind } from './bind.js';
import { observe } from './booleans.js';
import { materialize, toData } from './data.js';
import { fail } from './failure.js';
import type { Out } from './out.js';
import { scalar } from './scalar.js';
import { findLocal, rootScope, type Scope } from './scope.js';
import { fresh, keyLocal } from './unit.js';
import { scalarValue, type Value } from './value.js';

const argument = (node: Expression | SpreadElement): Expression =>
    node.type === "SpreadElement" ? fail(node, "spread arguments are not in the kernel subset") : node;

const scalarArgument = (node: Expression | SpreadElement, scope: Scope, out: Out): string => {
    const expression = argument(node);
    return scalar(scope.unit.expression(expression, scope, out), expression, scope);
};

/** A module-scope key named in a command, such as a component in `remove` or a computed key in `spawn` values. */
const commandKey = (node: Node, scope: Scope): string =>
    node.type === "Identifier" && findLocal(scope, node.name) === undefined && scope.unit.module.has(node.name)
        ? keyLocal(scope.unit, node.name)
        : fail(node, "commands name components by identifiers bound at module scope");

const commandValues = (node: Expression | SpreadElement | undefined, call: Node, scope: Scope, out: Out): string => {
    if (node?.type !== "ObjectExpression") return fail(node ?? call, "command values must be an object literal like { [position]: value }");
    const entries = node.properties.map(property => {
        if (property.type === "SpreadElement" || !property.computed) return fail(property, "command value keys must be computed component identifiers like [position]");
        const value = scope.unit.expression(property.value, scope, out);
        return `[${commandKey(property.key, scope)}]: ${observe(scope.unit, materialize(toData(value, property.value, scope)))}`;
    });
    return `{ ${entries.join(", ")} }`;
};

const command = (name: string, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const [entity, ...rest] = node.arguments;
    if (entity === undefined) return fail(node, `commands.${name} needs arguments`);
    switch (name) {
        case "spawn": {
            const result = fresh(scope.unit, "spawned");
            out.push(`const ${result} = commands.spawn(${commandValues(entity, node, scope, out)});`);
            return scalarValue(result);
        }
        case "despawn":
            out.push(`commands.despawn(${scalarArgument(entity, scope, out)});`);
            return scalarValue("undefined");
        case "add": {
            const target = scalarArgument(entity, scope, out);
            out.push(`commands.add(${target}, ${commandValues(rest[0], node, scope, out)});`);
            return scalarValue("undefined");
        }
        default: {
            const target = scalarArgument(entity, scope, out);
            out.push(`commands.remove(${[target, ...rest.map(key => commandKey(argument(key), scope))].join(", ")});`);
            return scalarValue("undefined");
        }
    }
};

/** Inlines a helper: arguments are bound to fresh parameter locals, and the body is compiled in the helper's own scope. */
const inline = (helper: Extract<Value, { kind: "function" }>, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    if (unit.active.has(helper.name)) return fail(node, `${helper.name} is recursive`);
    if (node.arguments.length > helper.params.length) return fail(node, `${helper.name} takes ${helper.params.length} arguments`);
    const values = node.arguments.map(item => unit.expression(argument(item), scope, out));
    unit.active.add(helper.name);
    const inner = rootScope(unit, true);
    helper.params.forEach((param, index) => {
        const value = values[index] ?? fail(node, `${helper.name} needs ${helper.params.length} arguments`);
        bind(param, value, "parameter", inner, out);
    });
    let result: Value;
    if (helper.body.type === "BlockStatement") {
        const statements = helper.body.body;
        const last = statements[statements.length - 1];
        if (last?.type !== "ReturnStatement" || !last.argument) return fail(helper.body, `${helper.name} must end with return <value>`);
        for (const statement of statements.slice(0, -1)) unit.statement(statement, inner, out);
        result = unit.expression(last.argument, inner, out);
    } else {
        result = unit.expression(helper.body, inner, out);
    }
    unit.active.delete(helper.name);
    return result;
};

/** Compiles a call: a `Math` function, a command, a lookup or a helper. */
export const call = (node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    if (node.optional) return fail(node, "optional calls are not in the kernel subset");
    if (node.callee.type === "Super") return fail(node, "super is not in the kernel subset");
    const callee = scope.unit.expression(node.callee, scope, out);
    switch (callee.kind) {
        case "method":
            if (callee.owner === "commands") return command(callee.name, node, scope, out);
            return scalarValue(`Math.${callee.name}(${node.arguments.map(item => scalarArgument(item, scope, out)).join(", ")})`);
        case "lookup": {
            if (node.arguments.length !== 1) return fail(node, "a lookup takes one entity");
            const entity = scalarArgument(node.arguments[0], scope, out);
            const found = fresh(scope.unit, "found");
            out.push(`const ${found} = l${callee.lookup}(${entity});`);
            return { kind: "found", lookup: callee.lookup, code: found };
        }
        case "function":
            return inline(callee, node, scope, out);
        default:
            return fail(node.callee, "only Math functions, commands, lookups and helpers defined in this module can be called");
    }
};
