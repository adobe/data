import type { Node } from 'estree';
import { componentRead, fieldRead } from './columns.js';
import { fail } from './failure.js';
import type { Scope } from './scope.js';
import { local, type Expression } from './ir.js';
import { snapshotLeaf } from './snapshot.js';
import { describeValue, type Value } from './value.js';

/** The `rowLeaves` index of a leaf bodies read of a lookup's rows, listed once. */
const rowLeafIndex = (unit: Scope["unit"], lookup: number, read: number, path: readonly (number | string)[]): number => {
    const text = JSON.stringify([lookup, read, path]);
    const index = unit.rowLeaves.indexOf(text);
    if (index >= 0) return index;
    unit.rowLeaves.push(text);
    return unit.rowLeaves.length - 1;
};

/** A component in `write` is readable too. */
export const requireReadable = (node: Node, scope: Scope, component: string): void => {
    const { signature } = scope.unit;
    if (!signature.read.has(component) && !signature.write.has(component)) fail(node, `${component} is not in components read or write`);
    scope.unit.used.read.add(component);
};

/** A value used as a number or boolean. A component of unknown shape is read as a scalar. */
export const scalar = (value: Value, node: Node, scope: Scope): Expression => {
    switch (value.kind) {
        case "scalar": case "dynamic": case "found":
            return value.expression;
        case "component":
            if (value.up === true) return componentRead(scope.unit, value);
            requireReadable(node, scope, value.component);
            return fieldRead(scope.unit, value.component, value.path);
        case "snapshot":
            return local(snapshotLeaf(scope.unit, value.snapshot, value.path));
        // A row tests as found, so a unique index's result compares with null as a lookup's does.
        case "indexed":
            return { kind: "rowFound", row: value.first, lookup: value.lookup };
        case "indexRow":
            return { kind: "rowFound", row: value.row, lookup: value.lookup };
        case "rowRead":
            return { kind: "rowLeaf", row: value.row, lookup: value.lookup, leaf: rowLeafIndex(scope.unit, value.lookup, value.read, value.path) };
        default:
            return fail(node, `expected a number or boolean, not ${describeValue(value)}`);
    }
};
