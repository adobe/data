// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { AssignmentExpression, Expression as SourceExpression, Node, Pattern, UpdateExpression } from 'estree';
import { access } from './access.js';
import { failPattern } from './bind.js';
import { set } from './booleans.js';
import { changedColumns, fieldColumn, fieldRead } from './columns.js';
import { leavesOf, toData, type Data } from './data.js';
import { fail } from './failure.js';
import { isBinary, local, number, references, type Expression } from './ir.js';
import { propertyKey } from './key.js';
import type { Out } from './out.js';
import { requireReadable } from './scalar.js';
import { findLocal, type Scope } from './scope.js';
import { snapshotLeaf } from './snapshot.js';
import { fresh } from './unit.js';
import { describeValue, type Value } from './value.js';

/** One scalar store. `component` is set for row writes, which stamp the changed column. */
type Target =
    | { readonly kind: "local"; readonly local: number }
    | { readonly kind: "column"; readonly column: number }
    | { readonly kind: "element"; readonly index: number; readonly element: Expression };
type Store = { readonly target: Target; readonly value: Expression; readonly component: string | undefined };

/** An element of a resource, at a runtime or literal index: a typed array's, which a kernel writes in place. */
const elementOf = (expression: Expression): { readonly index: number; readonly element: Expression } | null => {
    if (expression.kind === "resourceElement") return { index: expression.index, element: expression.element };
    const [only] = expression.kind === "resource" ? expression.path : [];
    return expression.kind === "resource" && expression.path.length === 1 && typeof only === "number" ? { index: expression.index, element: number(only) } : null;
};

const localTarget = (node: Node, expression: Expression, scope: Scope): Target => {
    if (expression.kind === "local") return { kind: "local", local: expression.local };
    const element = elementOf(expression);
    if (element === null) return fail(node, "this can't be assigned in a kernel");
    scope.unit.resourceWrites.add(element.index);
    return { kind: "element", ...element };
};

const root = (node: Node): string | undefined =>
    node.type === "Identifier" ? node.name : node.type === "MemberExpression" ? root(node.object) : undefined;

const requireWritable = (node: Node, scope: Scope, component: string): void => {
    if (!scope.unit.signature.write.has(component)) fail(node, `${component} is not in components write`);
    scope.unit.used.write.add(component);
};

/** Resolves an assignment target to a value whose scalar leaves are assignable. */
const targetValue = (node: SourceExpression | Pattern, scope: Scope, out: Out): Value => {
    const value = scope.unit.expression(node, scope, out);
    if (value.kind === "component") {
        if (value.up === true) return fail(node, "up is read-only");
        requireWritable(node, scope, value.component);
        // Values are immutable: a write replaces the whole component value.
        if (value.path.length > 0) return fail(node, "component values are immutable; write the whole value");
        return value;
    }
    // A typed array resource's elements are written in place.
    if (value.kind === "dynamic" && elementOf(value.expression) !== null) return value;
    if (node.type !== "Identifier") return fail(node, "values are immutable; assign a whole new value to a let local");
    const name = root(node);
    const local = name === undefined ? undefined : findLocal(scope, name);
    if (value.kind === "dynamic" && (local?.mutable !== true || node.type !== "Identifier")) return fail(node, "resources, args and lookup results are read-only in kernels");
    if (local === undefined) return fail(node, "this can't be assigned in a kernel");
    if (!local.mutable) return fail(node, `${name} is const`);
    return value;
};

/** Pairs a target with assigned data, leaf by leaf. */
const pair = (node: Node, target: Value, data: Data, scope: Scope): readonly Store[] => {
    const unit = scope.unit;
    switch (target.kind) {
        case "component": {
            const leaves = leavesOf(data);
            if (target.path.length === 0 && data.kind !== "leaf") {
                unit.shapes.add(`{ component: ${target.component}, leaves: ${JSON.stringify(leaves.map(leaf => leaf.path))} }`);
            }
            return leaves.map(leaf => ({
                target: { kind: "column", column: fieldColumn(unit, target.component, [...target.path, ...leaf.path]) }, value: leaf.expression, component: target.component,
            }));
        }
        case "snapshot":
            return leavesOf(data).map(leaf => ({
                target: { kind: "local", local: snapshotLeaf(unit, target.snapshot, [...target.path, ...leaf.path]) }, value: leaf.expression, component: undefined,
            }));
        case "scalar": case "dynamic":
            return data.kind === "leaf" ? [{ target: localTarget(node, target.expression, scope), value: data.expression, component: undefined }] : fail(node, "can't assign a tuple or struct to a scalar");
        case "tuple":
            return data.kind === "tuple" && data.items.length === target.items.length
                ? target.items.flatMap((item, index) => pair(node, item, data.items[index], scope))
                : fail(node, "the assigned value must have the same shape");
        case "struct":
            if (data.kind !== "struct") return fail(node, "the assigned value must have the same shape");
            return target.fields.flatMap(([name, field]) => {
                const source = data.fields.find(([sourceName]) => sourceName === name);
                return source ? pair(node, field, source[1], scope) : fail(node, `the assigned value has no field ${name}`);
            });
        default:
            return fail(node, `can't assign to ${describeValue(target)}`);
    }
};

const collect = (pattern: Pattern, value: Value, scope: Scope, out: Out): readonly Store[] => {
    switch (pattern.type) {
        case "ArrayPattern":
            return pattern.elements.flatMap((element, index) => element === null ? []
                : element.type === "RestElement" ? fail(element, "rest elements are not in the kernel subset")
                : collect(element, access(value, { kind: "static", name: index }, element, scope, false), scope, out));
        case "ObjectPattern":
            return pattern.properties.flatMap(property => property.type === "RestElement"
                ? fail(property, "rest elements are not in the kernel subset")
                : collect(property.value, access(value, propertyKey(property, scope, out), property, scope, false), scope, out));
        case "Identifier": case "MemberExpression":
            return pair(pattern, targetValue(pattern, scope, out), toData(value, pattern, scope), scope);
        default:
            return failPattern(pattern);
    }
};

/** Whether `value` reads what `target` writes. */
const reads = (value: Expression, target: Target): boolean => references(value, node => target.kind === "local"
    ? node.kind === "local" && node.local === target.local
    : target.kind === "column" ? node.kind === "column" && node.column === target.column
    : (node.kind === "resourceElement" || node.kind === "resource") && node.index === target.index);

/**
 * Emits stores as if every right-hand leaf were evaluated first, so `[a, b] = [b, a]` swaps: a leaf that reads an
 * earlier store's target is copied to a temporary first. Each written component is stamped once.
 */
const emit = (stores: readonly Store[], scope: Scope, out: Out): void => {
    const unit = scope.unit;
    const values = stores.map((store, index) => {
        if (!stores.slice(0, index).some(earlier => reads(store.value, earlier.target))) return store.value;
        const temporary = fresh(unit, "t");
        out.push(set(unit, temporary, store.value, "const"));
        return local(temporary);
    });
    stores.forEach((store, index) => {
        const { target } = store;
        out.push(target.kind === "local" ? set(unit, target.local, values[index], undefined)
            : target.kind === "column" ? { kind: "store", column: target.column, value: values[index] }
            : { kind: "resourceStore", index: target.index, element: target.element, value: values[index] });
    });
    for (const component of new Set(stores.flatMap(store => store.component === undefined ? [] : [store.component]))) {
        out.push({ kind: "stamp", ...changedColumns(unit, component) });
    }
};

/** A scalar read-modify-write target. */
const compoundStore = (node: SourceExpression | Pattern, operator: string, operand: Expression, scope: Scope, out: Out): Store => {
    if (!isBinary(operator)) return fail(node, `${operator}= is not in the kernel subset`);
    const target = targetValue(node, scope, out);
    const unit = scope.unit;
    const combine = (current: Expression): Expression => ({ kind: "binary", operator, left: current, right: operand });
    switch (target.kind) {
        case "component":
            requireReadable(node, scope, target.component);
            return {
                target: { kind: "column", column: fieldColumn(unit, target.component, target.path) },
                value: combine(fieldRead(unit, target.component, target.path)), component: target.component,
            };
        case "snapshot": {
            const leaf = snapshotLeaf(unit, target.snapshot, target.path);
            return { target: { kind: "local", local: leaf }, value: combine(local(leaf)), component: undefined };
        }
        case "scalar": case "dynamic": {
            const stored = localTarget(node, target.expression, scope);
            const current = stored.kind === "element" ? { kind: "resourceElement" as const, index: stored.index, element: stored.element } : target.expression;
            return { target: stored, value: combine(current), component: undefined };
        }
        default:
            return fail(node, `compound assignment needs a scalar, not ${describeValue(target)}`);
    }
};

const logical = new Set(["&&=", "||=", "??="]);

/** Compiles an assignment statement. */
export const assign = (node: AssignmentExpression, scope: Scope, out: Out): void => {
    if (node.operator === "=") {
        const value = scope.unit.expression(node.right, scope, out);
        return emit(collect(node.left, value, scope, out), scope, out);
    }
    if (logical.has(node.operator)) return fail(node, `${node.operator} is not in the kernel subset`);
    const operand = toData(scope.unit.expression(node.right, scope, out), node.right, scope);
    if (operand.kind !== "leaf") return fail(node.right, "compound assignment needs a scalar");
    emit([compoundStore(node.left, node.operator.slice(0, -1), operand.expression, scope, out)], scope, out);
};

/** Compiles `x++`, `--x` and friends as statements. */
export const update = (node: UpdateExpression, scope: Scope, out: Out): void =>
    emit([compoundStore(node.argument, node.operator === "++" ? "+" : "-", number(1), scope, out)], scope, out);
