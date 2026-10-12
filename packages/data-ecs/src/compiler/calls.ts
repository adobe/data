import type { SimpleCallExpression, Expression as SourceExpression, Node, SpreadElement, Statement as SourceStatement } from 'estree';
import { mergeBranches } from './branches.js';
import { bind } from './bind.js';
import { observe, set } from './booleans.js';
import { access } from './access.js';
import { dataValue, leavesOf, mapLeaves, materialize, toData } from './data.js';
import { fail, within } from './failure.js';
import { local, references, type Expression, type Statement } from './ir.js';
import type { Program } from '../world/create/kernel.js';
import type { Out } from './out.js';
import { frameIn } from './module-value.js';
import { scalar } from './scalar.js';
import { childScope, findLocal, rootScope, type Scope } from './scope.js';
import { fresh, keyIndex } from './unit.js';
import { scalarValue, type Value } from './value.js';

const argument = (node: SourceExpression | SpreadElement): SourceExpression =>
    node.type === "SpreadElement" ? fail(node, "spread arguments are not in the kernel subset") : node;

const scalarArgument = (node: SourceExpression | SpreadElement, scope: Scope, out: Out): Expression => {
    const expression = argument(node);
    return scalar(scope.unit.expression(expression, scope, out), expression, scope);
};

/** A module-scope key named in a command, such as a component in `remove` or a computed key in `spawn` values. */
const commandKey = (node: Node, scope: Scope): number =>
    node.type === "Identifier" && findLocal(scope, node.name) === undefined && scope.module.bindings.has(node.name)
        ? keyIndex(scope.unit, node.name)
        : fail(node, "commands name components by identifiers bound at module scope");

/** A value as a temporary, so command arguments are evaluated in source order before the command starts. */
const temporary = (scope: Scope, out: Out, hint: string, value: Expression): Expression => {
    if (value.kind === "local" || value.kind === "number" || value.kind === "boolean") return value;
    const name = fresh(scope.unit, hint);
    out.push(set(scope.unit, name, value, "const"));
    return local(name);
};

/** Command values as `(key index, value)` pairs, each evaluated into a temporary. */
const commandValues = (node: SourceExpression | SpreadElement | undefined, call: Node, scope: Scope, out: Out): readonly Statement[] => {
    if (node?.type !== "ObjectExpression") return fail(node ?? call, "command values must be an object literal like { [position]: value }");
    return node.properties.map((property): Statement => {
        if (property.type === "SpreadElement" || !property.computed) return fail(property, "command value keys must be computed component identifiers like [position]");
        const key = commandKey(property.key, scope);
        const value = scope.unit.expression(property.value, scope, out);
        return { kind: "value", key, value: temporary(scope, out, "value", observe(scope.unit, materialize(toData(value, property.value, scope)))) };
    });
};

const none = scalarValue({ kind: "nullish", value: "undefined" });

const command = (name: string, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const [entity, ...rest] = node.arguments;
    if (entity === undefined) return fail(node, `commands.${name} needs arguments`);
    switch (name) {
        case "spawn": {
            const values = commandValues(entity, node, scope, out);
            const result = fresh(scope.unit, "spawned");
            out.push({ kind: "spawn", local: result }, ...values);
            return scalarValue(local(result));
        }
        case "despawn":
            out.push({ kind: "begin", command: 1, entity: temporary(scope, out, "entity", scalarArgument(entity, scope, out)) });
            return none;
        case "add": {
            const target = temporary(scope, out, "entity", scalarArgument(entity, scope, out));
            const values = commandValues(rest[0], node, scope, out);
            out.push({ kind: "begin", command: 2, entity: target }, ...values);
            return none;
        }
        default: {
            const target = temporary(scope, out, "entity", scalarArgument(entity, scope, out));
            const keys = rest.map(key => commandKey(argument(key), scope));
            out.push({ kind: "begin", command: 3, entity: target }, ...keys.map((key): Statement => ({ kind: "component", key })));
            return none;
        }
    }
};

/** Whether a statement returns somewhere outside nested functions and loops. */
const containsReturn = (node: Node): boolean => {
    switch (node.type) {
        case "ReturnStatement": return true;
        case "BlockStatement": return node.body.some(containsReturn);
        case "IfStatement": return containsReturn(node.consequent) || (node.alternate !== null && node.alternate !== undefined && containsReturn(node.alternate));
        default: return false;
    }
};

const statementsOf = (node: SourceStatement): readonly SourceStatement[] => node.type === "BlockStatement" ? node.body : [node];

/** Statements to run in order, each run in its scope: the statements of a block, then of the blocks after it. */
type Segment = { readonly statements: readonly SourceStatement[]; readonly scope: Scope };

/** A copy of a scope, so each branch of a split block declares its own locals. */
const forkScope = (scope: Scope): Scope => ({ ...scope, locals: new Map(scope.locals) });

/**
 * A helper body's value. A return inside an `if` splits the block: each branch runs its own statements and then
 * the rest of the block, and their returned values merge as a conditional would.
 */
const helperBlock = (name: string, segments: readonly Segment[], node: Node, out: Out): Value => {
    const [segment, ...after] = segments;
    if (segment === undefined) return fail(node, `${name} must end with return <value>`);
    const { statements, scope } = segment;
    const unit = scope.unit;
    for (let index = 0; index < statements.length; index++) {
        const statement = statements[index];
        if (statement.type === "ReturnStatement") {
            if (!statement.argument) return fail(statement, `${name} must return a value`);
            return unit.expression(statement.argument, scope, out);
        }
        if (statement.type === "IfStatement" && containsReturn(statement)) {
            const test = scalar(unit.expression(statement.test, scope, out), statement.test, scope);
            const rest = (fork: Scope): Segment[] => [{ statements: statements.slice(index + 1), scope: fork }, ...after.map(next => ({ ...next, scope: forkScope(next.scope) }))];
            const branch = (taken: SourceStatement | null | undefined, branchOut: Out): Value => {
                const fork = forkScope(scope);
                const own: Segment[] = taken === null || taken === undefined ? [] : [{ statements: statementsOf(taken), scope: childScope(fork) }];
                return helperBlock(name, [...own, ...rest(fork)], statement, branchOut);
            };
            const consequentOut: Out = [];
            const alternateOut: Out = [];
            const consequent = toData(branch(statement.consequent, consequentOut), statement.consequent, scope);
            const alternate = toData(branch(statement.alternate, alternateOut), statement, scope);
            return mergeBranches(statement, test, consequent, consequentOut, alternate, alternateOut, scope, out);
        }
        unit.statement(statement, scope, out);
    }
    return helperBlock(name, after, node, out);
};

/** Scalar lanes of a WGSL value type. */
const laneCount = (type: Program.ValueType): number => type === "mat4x4f" ? 16 : type.startsWith("vec") ? Number(type[3]) : 1;

/** An argument's lanes as an intrinsic operand of `type`, or null if its shape doesn't match. */
const operandLanes = (value: Value, type: Program.ValueType, node: SimpleCallExpression, scope: Scope): readonly Expression[] | null => {
    const isLeaf = (item: Value): boolean => ["scalar", "dynamic", "found", "component", "snapshot"].includes(item.kind);
    const count = laneCount(type);
    if (count === 1) return isLeaf(value) ? [scalar(value, node, scope)] : null;
    if (value.kind === "tuple") return value.items.length === count && value.items.every(isLeaf) ? value.items.map(item => scalar(item, node, scope)) : null;
    if (value.kind === "component" || value.kind === "snapshot" || value.kind === "dynamic") {
        return Array.from({ length: count }, (_, index) => scalar(access(value, { kind: "static", name: index }, node, scope, false), node, scope));
    }
    return null;
};

/**
 * A GPU kernel's call to a function that matches a WGSL builtin, as an intrinsic region: its operands, and its inlined
 * body, whose result lanes the region names. Each operand lane is read once by each backend where the call is: by the
 * builtin, or by the body binding its parameters. Null where the call doesn't fit the declaration, so it is inlined
 * as usual.
 */
const intrinsicCall = (helper: Extract<Value, { kind: "function" }>, intrinsic: Program.Intrinsic, values: readonly Value[], node: SimpleCallExpression, scope: Scope, out: Out, compile: (bind: (index: number) => Value, bodyOut: Out) => Value): Value | null => {
    const unit = scope.unit;
    if (intrinsic.parameters.length !== helper.params.length || values.length !== helper.params.length) return null;
    const lanes = intrinsic.parameters.map((type, index) => operandLanes(values[index], type, node, scope));
    if (lanes.some(item => item === null)) return null;
    const operands = lanes.map(item => item ?? []);
    const body: Out = [];
    const result = toData(compile(index => {
        const [first, ...rest] = operands[index] ?? [];
        return first !== undefined && rest.length === 0 && laneCount(intrinsic.parameters[index] ?? "f32") === 1
            ? scalarValue(first)
            : { kind: "tuple", items: (operands[index] ?? []).map(scalarValue) };
    }, body), node, scope);
    const leaves = leavesOf(result);
    const flat = laneCount(intrinsic.result) === 1 ? result.kind === "leaf" : result.kind === "tuple" && result.items.every(item => item.kind === "leaf");
    if (!flat || leaves.length !== laneCount(intrinsic.result) || leaves.some(leaf => references(leaf.expression, item => item.kind === "column"))) {
        out.push(...body);
        return dataValue(result);
    }
    const id = unit.next();
    out.push({ kind: "intrinsic", id, name: helper.name, intrinsic, operands, body });
    let lane = 0;
    return dataValue(mapLeaves(result, value => ({ kind: "lane", intrinsic: id, lane: lane++, value })));
};

/** Inlines a helper: arguments are bound to fresh parameter locals, and the body is compiled in the helper's own scope. */
const inline = (helper: Extract<Value, { kind: "function" }>, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    if (unit.active.has(helper.identity)) return fail(node, `${helper.name} is recursive`);
    if (node.arguments.length > helper.params.length) return fail(node, `${helper.name} takes ${helper.params.length} arguments`);
    const values = node.arguments.map(item => unit.expression(argument(item), scope, out));
    if (values.length < helper.params.length) return fail(node, `${helper.name} needs ${helper.params.length} arguments`);
    unit.active.add(helper.identity);
    const body = (argumentOf: (index: number) => Value, bodyOut: Out): Value => {
        const compile = (): Value => {
            const inner = rootScope(unit, true, helper.module);
            helper.params.forEach((param, index) => bind(param, argumentOf(index), "parameter", inner, bodyOut));
            return helper.body.type === "BlockStatement"
                ? helperBlock(helper.name, [{ statements: helper.body.body, scope: inner }], helper.body, bodyOut)
                : unit.expression(helper.body, inner, bodyOut);
        };
        return helper.module === scope.module ? compile() : within(node, frameIn(helper.module, helper.name), compile);
    };
    const argumentOf = (index: number): Value => values[index] ?? fail(node, `${helper.name} needs ${helper.params.length} arguments`);
    const result = (unit.target === "gpu" && helper.intrinsic !== undefined ? intrinsicCall(helper, helper.intrinsic, values, node, scope, out, body) : null)
        ?? body(argumentOf, out);
    unit.active.delete(helper.identity);
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
            return scalarValue({ kind: "math", name: callee.name, arguments: node.arguments.map(item => scalarArgument(item, scope, out)) });
        case "lookup": {
            if (node.arguments.length !== 1) return fail(node, "a lookup takes one entity");
            const entity = scalarArgument(node.arguments[0], scope, out);
            const found = fresh(scope.unit, "found");
            out.push({ kind: "lookup", local: found, lookup: callee.lookup, entity });
            return { kind: "found", lookup: callee.lookup, expression: local(found) };
        }
        case "function":
            return inline(callee, node, scope, out);
        default:
            return fail(node.callee, "only Math functions, commands, lookups and helpers can be called");
    }
};
