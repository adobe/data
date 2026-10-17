import type { Node } from 'estree';
import { componentRead, fieldRead } from './columns.js';
import { fail } from './failure.js';
import type { Scope } from './scope.js';
import { local, type Expression } from './ir.js';
import { snapshotLeaf } from './snapshot.js';
import { describeValue, type Value } from './value.js';

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
        default:
            return fail(node, `expected a number or boolean, not ${describeValue(value)}`);
    }
};
