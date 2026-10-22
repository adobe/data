import type { Node } from 'estree';
import { set } from './booleans.js';
import { dataValue, leavesOf, mapLeaves, sameShape, type Data } from './data.js';
import { fail } from './failure.js';
import { local, type Expression } from './ir.js';
import type { Out } from './out.js';
import type { Scope } from './scope.js';
import { fresh } from './unit.js';
import type { Value } from './value.js';

const isTrivial = (expression: Expression): boolean =>
    expression.kind === "local" || expression.kind === "number" || expression.kind === "boolean";

/** Declares `let` locals for data's leaves, and returns them as data plus an assignment of other data to them. */
export const temporaries = (data: Data, scope: Scope, out: Out): { readonly result: Data; readonly assign: (source: Data) => Out } => {
    const locals = leavesOf(data).map(() => fresh(scope.unit, "t"));
    let index = 0;
    const result = mapLeaves(data, () => local(locals[index++]));
    out.push({ kind: "declare", locals });
    return { result, assign: source => leavesOf(source).map((leaf, leafIndex) => set(scope.unit, locals[leafIndex], leaf.expression, undefined)) };
};

/**
 * The value of choosing between two branches on `test`: each leaf a conditional when neither branch emitted
 * statements, else an `if` assigning temporaries.
 */
export const mergeBranches = (node: Node, test: Expression, consequent: Data, consequentOut: Out, alternate: Data, alternateOut: Out, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    if (!sameShape(consequent, alternate)) return fail(node, "both branches must have the same shape");
    if (consequentOut.length === 0 && alternateOut.length === 0) {
        let condition = test;
        if (consequent.kind !== "leaf" && !isTrivial(test)) {
            const name = fresh(unit, "test");
            out.push(set(unit, name, test, "const"));
            condition = local(name);
        }
        const alternateLeaves = leavesOf(alternate);
        let index = 0;
        return dataValue(mapLeaves(consequent, expression =>
            ({ kind: "conditional", test: condition, consequent: expression, alternate: alternateLeaves[index++].expression })));
    }
    const { result, assign } = temporaries(consequent, scope, out);
    out.push({ kind: "if", test, consequent: [...consequentOut, ...assign(consequent)], alternate: [...alternateOut, ...assign(alternate)] });
    return dataValue(result);
};
