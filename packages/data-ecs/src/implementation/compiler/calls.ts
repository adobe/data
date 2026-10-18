import type { SimpleCallExpression, Expression as SourceExpression, Node, SpreadElement, Statement as SourceStatement } from 'estree';
import { mergeBranches } from './branches.js';
import { bind } from './bind.js';
import { observe, set } from './booleans.js';
import { access } from './access.js';
import { dataValue, leavesOf, mapLeaves, materialize, toData } from './data.js';
import { fail, within } from './failure.js';
import { local, references, type Expression, type Statement } from './ir.js';
import type { Program } from '../world/kernel.js';
import { laneCount } from '../world/intrinsics.js';
import type { Out } from './out.js';
import { frameIn } from './module-value.js';
import { scalar } from './scalar.js';
import { childScope, findLocal, rootScope, type Scope } from './scope.js';
import { fresh, keyIndex } from './unit.js';
import { isList, listLiteral } from './lists.js';
import { scalarValue, type Value } from './value.js';

const argument = (node: SourceExpression | SpreadElement): SourceExpression =>
    node.type === "SpreadElement" ? fail(node, "spread arguments are not in the kernel subset") : node;

const scalarArgument = (node: SourceExpression | SpreadElement, scope: Scope, out: Out): Expression => {
    const expression = argument(node);
    return scalar(scope.unit.expression(expression, scope, out), expression, scope);
};

/** A value as a temporary, so command arguments are evaluated in source order before the command starts. */
const temporary = (scope: Scope, out: Out, hint: string, value: Expression): Expression => {
    if (value.kind === "local" || value.kind === "number" || value.kind === "boolean") return value;
    const name = fresh(scope.unit, hint);
    out.push(set(scope.unit, name, value, "const"));
    return local(name);
};

/** The key names a command's list of components gives: an array literal, or a module-scope `const` holding one or `Archetype.create` of one. */
const commandList = (node: Node, scope: Scope): readonly string[] => {
    const list = node.type === "ArrayExpression" || node.type === "Identifier" ? listLiteral(node, scope.module.bindings) : null;
    if (list === null) return fail(node, "commands name their components in an array literal, or a const of this module holding one or Archetype.create of one");
    const names = list.elements.map(element => element !== null && element.type !== "SpreadElement" ? commandName(element, scope) : fail(list, "commands list components by identifiers bound at module scope"));
    const twice = names.find((name, k) => names.indexOf(name) < k);
    return twice === undefined ? names : fail(node, `${twice} is listed twice`);
};

/** A module-scope identifier naming a component in a command. */
const commandName = (node: Node, scope: Scope): string =>
    node.type === "Identifier" && findLocal(scope, node.name) === undefined && scope.module.bindings.has(node.name)
        ? node.name
        : fail(node, "commands name components by identifiers bound at module scope");

const none = scalarValue({ kind: "nullish", value: "undefined" });
const undefinedValue: Expression = { kind: "nullish", value: "undefined" };

/**
 * A list's values as `(key index, value)` pairs, each given one evaluated into a temporary in source order, and every
 * other component of the list `undefined`, which is its start.
 */
const commandValues = (list: readonly string[], node: SourceExpression | SpreadElement | undefined, call: Node, scope: Scope, out: Out): readonly Statement[] => {
    if (node?.type !== "ObjectExpression") return fail(node ?? call, "command values must be an object literal like { [position]: value }");
    const given = new Map<string, Expression>();
    for (const property of node.properties) {
        if (property.type === "SpreadElement" || !property.computed) return fail(property, "command value keys must be computed component identifiers like [position]");
        const name = commandName(property.key, scope);
        if (!list.includes(name)) return fail(property.key, `${name} isn't one of the command's components`);
        const value = scope.unit.expression(property.value, scope, out);
        given.set(name, temporary(scope, out, "value", observe(scope.unit, materialize(toData(value, property.value, scope)))));
    }
    return list.map((name): Statement => ({ kind: "value", key: keyIndex(scope.unit, name), value: given.get(name) ?? undefinedValue }));
};

/** Whether a command's second argument is a list of components rather than one. */
const listed = (node: Node, scope: Scope): boolean => node.type === "ArrayExpression" || (node.type === "Identifier" && findLocal(scope, node.name) === undefined && isList(node, scope.module.bindings));

/** `commands.spawn(components)(values)`: reserves an entity and gives each of the components its value or its start. */
const spawn = (inner: SimpleCallExpression, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const [components, ...extra] = inner.arguments;
    if (components === undefined || extra.length > 0 || node.arguments.length !== 1) return fail(node, "a spawn is commands.spawn(components)(values)");
    const values = commandValues(commandList(components, scope), node.arguments[0], node, scope, out);
    const result = fresh(scope.unit, "spawned");
    out.push({ kind: "spawn", local: result }, ...values);
    return scalarValue(local(result));
};

const command = (name: string, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const [entity, second, third, ...rest] = node.arguments;
    if (entity === undefined) return fail(node, `commands.${name} needs arguments`);
    switch (name) {
        case "spawn":
            return fail(node, "a kernel calls the spawner where it gets it, as commands.spawn(components)(values)");
        case "despawn":
            out.push({ kind: "begin", command: 1, entity: temporary(scope, out, "entity", scalarArgument(entity, scope, out)) });
            return none;
        case "add": {
            if (second === undefined || rest.length > 0) return fail(node, "an add is commands.add(entity, component, value) or commands.add(entity, components, values)");
            const target = temporary(scope, out, "entity", scalarArgument(entity, scope, out));
            const component = argument(second);
            if (listed(component, scope)) {
                const values = commandValues(commandList(component, scope), third, node, scope, out);
                out.push({ kind: "begin", command: 2, entity: target }, ...values);
                return none;
            }
            const key = keyIndex(scope.unit, commandName(component, scope));
            const value = third === undefined ? undefinedValue : temporary(scope, out, "value", observe(scope.unit, materialize(toData(scope.unit.expression(argument(third), scope, out), third, scope))));
            out.push({ kind: "begin", command: 2, entity: target }, { kind: "value", key, value });
            return none;
        }
        default: {
            if (second === undefined || third !== undefined) return fail(node, "a remove is commands.remove(entity, component) or commands.remove(entity, components)");
            const target = temporary(scope, out, "entity", scalarArgument(entity, scope, out));
            const component = argument(second);
            const names = listed(component, scope) ? commandList(component, scope) : [commandName(component, scope)];
            out.push({ kind: "begin", command: 3, entity: target }, ...names.map((key): Statement => ({ kind: "component", key: keyIndex(scope.unit, key) })));
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
        return helper.module === unit.module ? compile() : within(node, frameIn(helper.module, helper.name), compile);
    };
    const argumentOf = (index: number): Value => values[index] ?? fail(node, `${helper.name} needs ${helper.params.length} arguments`);
    const result = (unit.target === "gpu" && helper.intrinsic !== undefined ? intrinsicCall(helper, helper.intrinsic, values, node, scope, out, body) : null)
        ?? body(argumentOf, out);
    unit.active.delete(helper.identity);
    return result;
};

/** The accumulator local of one leaf of a reduction, made at its first contribution. */
const accumulator = (scope: Scope, reduced: number, path: readonly (number | string)[]): number => {
    const unit = scope.unit;
    const existing = unit.accumulators.find(entry => entry.reduced === reduced && JSON.stringify(entry.path) === JSON.stringify(path));
    if (existing !== undefined) return existing.local;
    const created = fresh(unit, "reduced");
    unit.accumulators.push({ reduced, path, local: created });
    return created;
};

/** `context[resource](value)`: folds each leaf of the value into its accumulator with the resource's operator. */
const contribute = (reduced: number, node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    const { resource, operator } = scope.unit.signature.reduced[reduced] ?? fail(node, "unknown reduction");
    if (node.arguments.length !== 1) return fail(node, `${resource} takes the one value it reduces`);
    const value = toData(scope.unit.expression(argument(node.arguments[0]), scope, out), node, scope);
    scope.unit.reducedShapes.add(`{ component: ${resource}, leaves: ${JSON.stringify(leavesOf(value).map(leaf => leaf.path))} }`);
    for (const { path, expression } of leavesOf(value)) {
        const target = accumulator(scope, reduced, path);
        const folded: Expression = operator === "min" || operator === "max"
            ? { kind: "math", name: operator, arguments: [local(target), expression] }
            : { kind: "binary", operator, left: local(target), right: expression };
        out.push(set(scope.unit, target, folded, undefined));
    }
    return none;
};

/** Compiles a call: a `Math` function, a command, a lookup, a reduction or a helper. */
export const call = (node: SimpleCallExpression, scope: Scope, out: Out): Value => {
    if (node.optional) return fail(node, "optional calls are not in the kernel subset");
    if (node.callee.type === "Super") return fail(node, "super is not in the kernel subset");
    if (node.callee.type === "CallExpression" && !node.callee.optional && node.callee.callee.type !== "Super") {
        const maker = scope.unit.expression(node.callee.callee, scope, out);
        if (maker.kind === "method" && maker.owner === "commands" && maker.name === "spawn") return spawn(node.callee, node, scope, out);
    }
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
        case "reducer":
            return contribute(callee.reduced, node, scope, out);
        default:
            return fail(node.callee, "only Math functions, commands, lookups, reductions and helpers can be called");
    }
};
