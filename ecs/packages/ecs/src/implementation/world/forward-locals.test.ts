// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { forwardLocals } from "./forward-locals.js";
import type { Program } from "./kernel.js";

type Expression = Program.Expression;
type Statement = Program.Statement;

const column = (index: number): Expression => ({ kind: "column", column: index });
const local = (index: number): Expression => ({ kind: "local", local: index });
const number = (value: number): Expression => ({ kind: "number", value });
const resource: Expression = { kind: "resource", index: 0, path: [] };
const times = (left: Expression, right: Expression): Expression => ({ kind: "binary", operator: "*", left, right });
const plus = (left: Expression, right: Expression): Expression => ({ kind: "binary", operator: "+", left, right });
const set = (index: number, value: Expression): Statement => ({ kind: "set", local: index, value });
const store = (index: number, value: Expression): Statement => ({ kind: "store", column: index, value });
/** Columns 0 to 2 are one component's leaves, 3 to 5 another's; 6 holds the same bytes as 0. */
const aliases = (a: number, b: number): boolean => a === b || (Math.min(a, b) === 0 && Math.max(a, b) === 6);
const forward = (body: readonly Statement[], reductions?: readonly number[]): readonly Statement[] =>
    forwardLocals({ locals: 8, body, ...reductions === undefined ? {} : { reductions } }, aliases).body;

describe("forwardLocals", () => {
    it("writes each temporary of an inlined call into the store reading it, so stores hold whole values", () => {
        // p = add(p, scale(v, d)), leaf by leaf, through snapshots and the scaled temporaries.
        const body = [
            set(0, column(3)), set(1, column(4)), set(2, resource),
            set(3, times(local(0), local(2))), set(4, times(local(1), local(2))),
            store(0, plus(column(0), local(3))), store(1, plus(column(1), local(4))),
        ];
        expect(forward(body)).toEqual([
            store(0, plus(column(0), times(column(3), resource))),
            store(1, plus(column(1), times(column(4), resource))),
        ]);
    });

    it("keeps a value whose column a store between changes, and one read twice", () => {
        expect(forward([set(0, column(0)), store(6, number(1)), store(1, local(0))])).toEqual([set(0, column(0)), store(6, number(1)), store(1, local(0))]);
        expect(forward([set(0, column(0)), store(1, number(1)), store(2, local(0))])).toEqual([store(1, number(1)), store(2, column(0))]);
        expect(forward([set(0, times(column(0), column(1))), store(2, plus(local(0), local(0)))])).toEqual([set(0, times(column(0), column(1))), store(2, plus(local(0), local(0)))]);
    });

    it("writes a constant into every read, in nested statements too, and keeps accumulators' assignments", () => {
        const branch: Statement = { kind: "if", test: { kind: "binary", operator: ">", left: column(0), right: local(0) }, consequent: [store(1, local(0))], alternate: [] };
        expect(forward([set(0, resource), branch, store(2, local(0))])).toEqual([
            { kind: "if", test: { kind: "binary", operator: ">", left: column(0), right: resource }, consequent: [store(1, resource)], alternate: [] },
            store(2, resource),
        ]);
        expect(forward([set(0, number(0)), store(1, local(0))], [0])).toEqual([set(0, number(0)), store(1, local(0))]);
    });

    it("doesn't move a value into a statement nested in a later one, nor past what it can't see through", () => {
        const nested: Statement = { kind: "if", test: column(1), consequent: [store(2, local(0))], alternate: [] };
        expect(forward([set(0, column(0)), nested])).toEqual([set(0, column(0)), nested]);
        const lookup: Statement = { kind: "find", handle: 0, lookup: 0, entity: column(5) };
        expect(forward([set(0, column(0)), lookup, store(2, local(0))])).toEqual([set(0, column(0)), lookup, store(2, local(0))]);
    });
});
