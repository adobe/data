import type { Node } from 'estree';
import { fieldRead } from './columns.js';
import { fail } from './failure.js';
import type { Scope } from './scope.js';
import { local, type Expression } from './ir.js';
import { snapshotLeaf } from './snapshot.js';
import { describeValue, type Value } from './value.js';

export const requireReadable = (node: Node, scope: Scope, component: string): void => {
    if (!scope.unit.signature.read.has(component)) {
        fail(node, scope.unit.signature.write.has(component)
            ? `${component} is write-only here; add it to query read to read it`
            : `${component} is not in query read`);
    }
};

/** A value used as a number or boolean. A component of unknown shape is read as a scalar. */
export const scalar = (value: Value, node: Node, scope: Scope): Expression => {
    switch (value.kind) {
        case "scalar": case "dynamic": case "found":
            return value.expression;
        case "component":
            requireReadable(node, scope, value.component);
            return fieldRead(scope.unit, value.component, value.path);
        case "snapshot":
            return local(snapshotLeaf(scope.unit, value.snapshot, value.path));
        default:
            return fail(node, `expected a number or boolean, not ${describeValue(value)}`);
    }
};
