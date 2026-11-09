// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Program } from "../world/kernel.js";
import { generateWasm, type WasmColumn } from "../world/wasm.js";
import { simplifyProgram } from "./simplify-program.js";

type Expression = Program.Expression;

const local = (index: number): Expression => ({ kind: "local", local: index });
const number = (value: number): Expression => ({ kind: "number", value });
const column = (index: number): Expression => ({ kind: "column", column: index });
const binary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: Expression, right: Expression): Expression => ({ kind: "binary", operator, left, right });

/** `randomRange(state, 3, 19)` inlined: its parameters are locals assigned the literal arguments once. */
const inlinedRange: Program = {
    locals: 3,
    body: [
        { kind: "set", local: 0, value: number(3) },
        { kind: "set", local: 1, value: number(19) },
        { kind: "set", local: 2, value: binary("+", binary("%", column(0), binary("+", binary("-", local(1), local(0)), number(1))), local(0)) },
        { kind: "store", column: 1, value: local(2) },
    ],
};

describe("simplifyProgram", () => {
    it("propagates a local assigned a literal once into what follows, folding what becomes literal", () => {
        expect(simplifyProgram(inlinedRange).body).toEqual([
            { kind: "set", local: 2, value: binary("+", binary("%", column(0), number(17)), number(3)) },
            { kind: "store", column: 1, value: local(2) },
        ]);
    });

    it("leaves a WASM kernel of an inlined range without the imported remainder", () => {
        const columns: WasmColumn[] = [{ view: "u32", stride: 4, offset: 0, boolean: false, component: 0 }, { view: "f64", stride: 8, offset: 0, boolean: false, component: 1 }];
        expect(generateWasm(inlinedRange, columns, () => "number")?.imports).toEqual(["remainder"]);
        expect(generateWasm(simplifyProgram(inlinedRange), columns, () => "number")?.imports).toEqual([]);
    });

    it("folds as JS evaluates numbers and booleans, -0 and NaN included", () => {
        const cases: [Expression, number | boolean][] = [
            [binary("-", number(0), number(0)), 0],
            [{ kind: "unary", operator: "-", operand: number(0) }, -0],
            [binary("/", number(1), number(0)), Infinity],
            [binary("%", number(-7), number(2)), -1],
            [binary("+", { kind: "boolean", value: true }, number(1)), 2],
            [binary("==", { kind: "boolean", value: true }, number(1)), true],
            [binary("===", { kind: "boolean", value: true }, number(1)), false],
            [binary(">>>", number(-1), number(0)), 4294967295],
            [binary("<", number(NaN), number(1)), false],
            [{ kind: "math", name: "max", arguments: [number(-0), number(0)] }, 0],
            [{ kind: "logical", operator: "||", left: number(0), right: number(5) }, 5],
            [{ kind: "conditional", test: number(NaN), consequent: number(1), alternate: number(2) }, 2],
        ];
        for (const [expression, expected] of cases) {
            const [folded] = simplifyProgram({ locals: 0, body: [{ kind: "store", column: 0, value: expression }] }).body;
            expect([expression, folded]).toEqual([expression, { kind: "store", column: 0, value: typeof expected === "boolean" ? { kind: "boolean", value: expected } : { kind: "number", value: expected } }]);
        }
    });

    it("keeps a local read before its one assignment, or assigned more than once, or read outside where it's assigned", () => {
        const program: Program = {
            locals: 3,
            body: [
                { kind: "store", column: 0, value: local(0) },
                { kind: "set", local: 0, value: number(1) },
                { kind: "set", local: 1, value: number(2) },
                { kind: "set", local: 1, value: number(3) },
                { kind: "if", test: column(1), consequent: [{ kind: "set", local: 2, value: number(4) }], alternate: [] },
                { kind: "store", column: 0, value: binary("+", binary("+", local(0), local(1)), local(2)) },
            ],
        };
        expect(simplifyProgram(program).body).toEqual([
            { kind: "store", column: 0, value: local(0) },
            { kind: "set", local: 0, value: number(1) },
            { kind: "set", local: 1, value: number(2) },
            { kind: "set", local: 1, value: number(3) },
            { kind: "if", test: column(1), consequent: [{ kind: "set", local: 2, value: number(4) }], alternate: [] },
            { kind: "store", column: 0, value: binary("+", binary("+", number(1), local(1)), local(2)) },
        ]);
    });

    it("runs the branch an if on a literal takes, and keeps accumulators' assignments", () => {
        const program: Program = {
            locals: 1,
            reductions: [0],
            body: [
                { kind: "if", test: binary(">", number(2), number(1)), consequent: [{ kind: "set", local: 0, value: number(5) }], alternate: [{ kind: "next" }] },
            ],
        };
        expect(simplifyProgram(program).body).toEqual([{ kind: "set", local: 0, value: number(5) }]);
    });

    it("drops a store of the value a column holds, read into a local neither assigned since", () => {
        const program: Program = {
            locals: 3,
            body: [
                { kind: "set", local: 0, value: column(0) },
                { kind: "set", local: 1, value: column(1) },
                { kind: "set", local: 2, value: column(2) },
                { kind: "if", test: column(3), consequent: [{ kind: "set", local: 2, value: number(5) }], alternate: [] },
                { kind: "store", column: 0, value: binary("+", local(0), number(1)) },
                { kind: "store", column: 1, value: local(1) },
                { kind: "store", column: 2, value: local(2) },
                { kind: "loop", body: [{ kind: "store", column: 1, value: local(1) }] },
            ],
        };
        expect(simplifyProgram(program).body).toEqual([
            { kind: "set", local: 0, value: column(0) },
            { kind: "set", local: 1, value: column(1) },
            { kind: "set", local: 2, value: column(2) },
            { kind: "if", test: column(3), consequent: [{ kind: "set", local: 2, value: number(5) }], alternate: [] },
            { kind: "store", column: 0, value: binary("+", local(0), number(1)) },
            { kind: "store", column: 2, value: local(2) },
            { kind: "loop", body: [{ kind: "store", column: 1, value: local(1) }] },
        ]);
    });
});
