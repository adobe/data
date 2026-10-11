import type { AssignmentExpression, Expression, Node, Pattern, UpdateExpression } from 'estree';
import { access } from './access.js';
import { failPattern } from './bind.js';
import { assignment, plainReads } from './booleans.js';
import { changedTarget, fieldRead, fieldTarget } from './columns.js';
import { leavesOf, toData, type Data } from './data.js';
import { fail } from './failure.js';
import { propertyKey } from './key.js';
import type { Out } from './out.js';
import { requireReadable } from './scalar.js';
import { findLocal, type Scope } from './scope.js';
import { snapshotLeaf } from './snapshot.js';
import { fresh } from './unit.js';
import { describeValue, type Value } from './value.js';

/** One scalar store: `target = code`. `component` is set for row writes, which stamp the changed column. */
type Store = { readonly target: string; readonly code: string; readonly component: string | undefined };

const root = (node: Node): string | undefined =>
    node.type === "Identifier" ? node.name : node.type === "MemberExpression" ? root(node.object) : undefined;

const requireWritable = (node: Node, scope: Scope, component: string): void => {
    if (!scope.unit.signature.write.has(component)) fail(node, `${component} is not in query write`);
};

/** Resolves an assignment target to a value whose scalar leaves are assignable. */
const targetValue = (node: Expression | Pattern, scope: Scope, out: Out): Value => {
    const value = scope.unit.expression(node, scope, out);
    if (value.kind === "component") {
        requireWritable(node, scope, value.component);
        // Values are immutable: a write replaces the whole component value.
        if (value.path.length > 0) return fail(node, "component values are immutable; write the whole value");
        return value;
    }
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
                target: fieldTarget(unit, target.component, [...target.path, ...leaf.path]), code: leaf.code, component: target.component,
            }));
        }
        case "snapshot":
            return leavesOf(data).map(leaf => ({
                target: snapshotLeaf(unit, target.snapshot, [...target.path, ...leaf.path]), code: leaf.code, component: undefined,
            }));
        case "scalar": case "dynamic":
            return data.kind === "leaf" ? [{ target: target.code, code: data.code, component: undefined }] : fail(node, "can't assign a tuple or struct to a scalar");
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

const escape = (text: string): string => text.replace(/[[\]$]/g, match => `\\${match}`);

/** Whether `code` reads `target`, a local name or a `c0[i]` column element. */
const reads = (code: string, target: string): boolean => new RegExp(`(^|[^\\w$])${escape(target)}($|[^\\w$])`).test(code);

/**
 * Emits stores as if every right-hand leaf were evaluated first, so `row[v] = [row[v][1], row[v][0]]` swaps:
 * a leaf that reads an earlier store's target is copied to a temporary first. Each written component is stamped once.
 */
const emit = (stores: readonly Store[], scope: Scope, out: Out): void => {
    const codes = stores.map((store, index) => {
        if (!stores.slice(0, index).some(earlier => reads(plainReads(store.code), earlier.target))) return store.code;
        const name = fresh(scope.unit, "t");
        out.push(assignment(scope.unit, "const ", name, store.code));
        return name;
    });
    stores.forEach((store, index) => out.push(store.component === undefined
        ? assignment(scope.unit, "", store.target, codes[index])
        : `${store.target} = ${codes[index]};`));
    for (const component of new Set(stores.flatMap(store => store.component === undefined ? [] : [store.component]))) {
        out.push(`${changedTarget(scope.unit, component)} = tick;`);
    }
};

/** A scalar read-modify-write target. */
const compoundStore = (node: Expression | Pattern, operator: string, operand: string, scope: Scope, out: Out): Store => {
    const target = targetValue(node, scope, out);
    const unit = scope.unit;
    switch (target.kind) {
        case "component":
            requireReadable(node, scope, target.component);
            return {
                target: fieldTarget(unit, target.component, target.path),
                code: `(${fieldRead(unit, target.component, target.path)} ${operator} ${operand})`, component: target.component,
            };
        case "snapshot": {
            const leaf = snapshotLeaf(unit, target.snapshot, target.path);
            return { target: leaf, code: `(${leaf} ${operator} ${operand})`, component: undefined };
        }
        case "scalar": case "dynamic":
            return { target: target.code, code: `(${target.code} ${operator} ${operand})`, component: undefined };
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
    emit([compoundStore(node.left, node.operator.slice(0, -1), operand.code, scope, out)], scope, out);
};

/** Compiles `x++`, `--x` and friends as statements. */
export const update = (node: UpdateExpression, scope: Scope, out: Out): void =>
    emit([compoundStore(node.argument, node.operator === "++" ? "+" : "-", "1", scope, out)], scope, out);
