// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Program } from '../world/kernel.js';

type Expression = Program.Expression;
type Statement = Program.Statement;
type Literal = Extract<Expression, { kind: "number" | "boolean" }>;
type Constants = ReadonlyMap<number, Literal>;

const isLiteral = (expression: Expression): expression is Literal => expression.kind === "number" || expression.kind === "boolean";
const literalOf = (value: number | boolean): Literal => typeof value === "boolean" ? { kind: "boolean", value } : { kind: "number", value };

/** `Math` functions whose result depends only on their arguments, which fold when every argument is a literal. */
const pure: ReadonlyMap<string, (...values: number[]) => number> = new Map(Object.entries({
    abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh, atan: Math.atan, atan2: Math.atan2,
    atanh: Math.atanh, cbrt: Math.cbrt, ceil: Math.ceil, clz32: Math.clz32, cos: Math.cos, cosh: Math.cosh, exp: Math.exp,
    expm1: Math.expm1, floor: Math.floor, fround: Math.fround, hypot: Math.hypot, imul: Math.imul, log: Math.log,
    log10: Math.log10, log1p: Math.log1p, log2: Math.log2, max: Math.max, min: Math.min, pow: Math.pow, round: Math.round,
    sign: Math.sign, sin: Math.sin, sinh: Math.sinh, sqrt: Math.sqrt, tan: Math.tan, tanh: Math.tanh, trunc: Math.trunc,
}));

/** A binary operator applied to literals, as JS applies it to numbers and booleans. */
const evaluateBinary = (operator: Extract<Expression, { kind: "binary" }>["operator"], left: number | boolean, right: number | boolean): number | boolean => {
    const a = Number(left);
    const b = Number(right);
    switch (operator) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "**": return a ** b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        case "==": return a === b;
        case "!=": return a !== b;
        case "===": return left === right;
        case "!==": return left !== right;
        case "&": return a & b;
        case "|": return a | b;
        case "^": return a ^ b;
        case "<<": return a << b;
        case ">>": return a >> b;
        case ">>>": return a >>> b;
    }
};

const evaluateUnary = (operator: Extract<Expression, { kind: "unary" }>["operator"], value: number | boolean): number | boolean => {
    switch (operator) {
        case "-": return -Number(value);
        case "+": return Number(value);
        case "!": return !value;
        case "~": return ~Number(value);
    }
};

/** An expression with the constants' locals replaced by their literals, and operations on literals computed. */
const foldExpression = (expression: Expression, constants: Constants): Expression => {
    const fold = (inner: Expression): Expression => foldExpression(inner, constants);
    switch (expression.kind) {
        case "local": return constants.get(expression.local) ?? expression;
        case "unary": {
            const operand = fold(expression.operand);
            return isLiteral(operand) ? literalOf(evaluateUnary(expression.operator, operand.value)) : { ...expression, operand };
        }
        case "binary": {
            const left = fold(expression.left);
            const right = fold(expression.right);
            return isLiteral(left) && isLiteral(right) ? literalOf(evaluateBinary(expression.operator, left.value, right.value)) : { ...expression, left, right };
        }
        case "logical": {
            const left = fold(expression.left);
            const right = fold(expression.right);
            if (!isLiteral(left)) return { ...expression, left, right };
            return Boolean(left.value) === (expression.operator === "&&") ? right : left;
        }
        case "conditional": {
            const test = fold(expression.test);
            const consequent = fold(expression.consequent);
            const alternate = fold(expression.alternate);
            if (isLiteral(test)) return test.value ? consequent : alternate;
            return { ...expression, test, consequent, alternate };
        }
        case "math": {
            const parameters = expression.arguments.map(fold);
            const evaluate = pure.get(expression.name);
            if (evaluate !== undefined && parameters.every(isLiteral)) return literalOf(evaluate(...parameters.map(parameter => Number(parameter.value))));
            return { ...expression, arguments: parameters };
        }
        case "lane": return { ...expression, value: fold(expression.value) };
        default: return expression;
    }
};

/** How many times each local is assigned and read, over every statement. */
const countUses = (statements: readonly Statement[], sets: Map<number, number>, reads: Map<number, number>): void => {
    const read = (expression: Expression): void => {
        switch (expression.kind) {
            case "local": reads.set(expression.local, (reads.get(expression.local) ?? 0) + 1); return;
            case "unary": read(expression.operand); return;
            case "binary": case "logical": read(expression.left); read(expression.right); return;
            case "conditional": read(expression.test); read(expression.consequent); read(expression.alternate); return;
            case "math": expression.arguments.forEach(read); return;
            case "lane": read(expression.value); return;
            default: return;
        }
    };
    for (const statement of statements) {
        switch (statement.kind) {
            case "set": sets.set(statement.local, (sets.get(statement.local) ?? 0) + 1); read(statement.value); break;
            case "store": read(statement.value); break;
            case "if": read(statement.test); countUses(statement.consequent, sets, reads); countUses(statement.alternate, sets, reads); break;
            case "block": case "loop": countUses(statement.body, sets, reads); break;
            case "branchIf": read(statement.test); break;
            case "find": read(statement.entity); break;
            case "probe": statement.values.forEach(read); break;
            case "listRow": read(statement.index); break;
            case "intrinsic": statement.operands.forEach(lanes => lanes.forEach(read)); countUses(statement.body, sets, reads); break;
            default: break;
        }
    }
};

/**
 * Statements with their expressions folded. A local assigned only once, a literal, reads as that literal everywhere
 * its assignment comes before: later in the same list or nested in what follows it, which every run reaching the read
 * passes through. An `if` on a literal becomes the branch it takes, since `if`s count toward no branch depth.
 */
const foldStatements = (statements: readonly Statement[], inherited: Constants, single: ReadonlySet<number>): Statement[] => {
    const constants = new Map(inherited);
    const result: Statement[] = [];
    const fold = (expression: Expression): Expression => foldExpression(expression, constants);
    const nested = (body: readonly Statement[]): Statement[] => foldStatements(body, constants, single);
    for (const statement of statements) {
        switch (statement.kind) {
            case "set": {
                const value = fold(statement.value);
                if (single.has(statement.local) && isLiteral(value)) constants.set(statement.local, value);
                result.push({ ...statement, value });
                break;
            }
            case "store": result.push({ ...statement, value: fold(statement.value) }); break;
            case "if": {
                const test = fold(statement.test);
                if (isLiteral(test)) result.push(...nested(test.value ? statement.consequent : statement.alternate));
                else result.push({ ...statement, test, consequent: nested(statement.consequent), alternate: nested(statement.alternate) });
                break;
            }
            case "block": case "loop": result.push({ ...statement, body: nested(statement.body) }); break;
            case "branchIf": result.push({ ...statement, test: fold(statement.test) }); break;
            case "find": result.push({ ...statement, entity: fold(statement.entity) }); break;
            case "probe": result.push({ ...statement, values: statement.values.map(fold) }); break;
            case "listRow": result.push({ ...statement, index: fold(statement.index) }); break;
            case "intrinsic": result.push({ ...statement, operands: statement.operands.map(lanes => lanes.map(fold)), body: nested(statement.body) }); break;
            default: result.push(statement);
        }
    }
    return result;
};

/** Statements without the assignments of `unread` locals, whose values are pure. */
const dropAssignments = (statements: readonly Statement[], unread: ReadonlySet<number>): Statement[] => statements.flatMap((statement): Statement[] => {
    switch (statement.kind) {
        case "set": return unread.has(statement.local) ? [] : [statement];
        case "if": return [{ ...statement, consequent: dropAssignments(statement.consequent, unread), alternate: dropAssignments(statement.alternate, unread) }];
        case "block": case "loop": return [{ ...statement, body: dropAssignments(statement.body, unread) }];
        case "intrinsic": return [{ ...statement, body: dropAssignments(statement.body, unread) }];
        default: return [statement];
    }
});

/** By column, the local known to hold the value in it. */
type Holding = ReadonlyMap<number, number>;

/** What both of two `Holding`s know. */
const both = (a: Holding, b: Holding): Map<number, number> => new Map([...a].filter(([column, local]) => b.get(column) === local));

/**
 * Statements without stores that write a column the value already in it: a local that was read from the column, with
 * neither assigned since, as writing a struct back with members it copied stores them. `held` is what's known at the
 * start, and is left as what's known at the end.
 */
const dropUnchangedStores = (statements: readonly Statement[], held: Map<number, number>): Statement[] => {
    const forget = (local: number): void => {
        for (const [column, holder] of held) if (holder === local) held.delete(column);
    };
    const result: Statement[] = [];
    for (const statement of statements) {
        switch (statement.kind) {
            case "set":
                forget(statement.local);
                if (statement.value.kind === "column") held.set(statement.value.column, statement.local);
                result.push(statement);
                break;
            case "store": {
                const { value } = statement;
                if (value.kind === "local" && held.get(statement.column) === value.local) break;
                if (value.kind === "local") held.set(statement.column, value.local);
                else held.delete(statement.column);
                result.push(statement);
                break;
            }
            case "if": {
                const consequentHeld = new Map(held);
                const alternateHeld = new Map(held);
                const consequent = dropUnchangedStores(statement.consequent, consequentHeld);
                const alternate = dropUnchangedStores(statement.alternate, alternateHeld);
                held.clear();
                for (const [column, local] of both(consequentHeld, alternateHeld)) held.set(column, local);
                result.push({ ...statement, consequent, alternate });
                break;
            }
            // A loop's body may run again after what follows in it, and a branch leaves from inside: nothing is known across them.
            case "block": case "loop": case "intrinsic": {
                held.clear();
                const body = dropUnchangedStores(statement.body, new Map());
                result.push({ ...statement, body });
                break;
            }
            case "branch": case "branchIf": case "next":
                result.push(statement);
                break;
            default:
                result.push(statement);
        }
    }
    return result;
};

/**
 * A program computing what `program` does with its constants propagated and folded, as inlined calls leave them: a
 * parameter given a literal argument is a local assigned that literal once, so `% (high - low + 1)` becomes `% 17`.
 * Assignments to locals nothing reads any more are dropped, and stores of a value a column already holds. Accumulators
 * keep every assignment.
 */
export const simplifyProgram = (program: Program): Program => {
    const accumulators = new Set(program.reductions ?? []);
    let body = program.body;
    for (let pass = 0; pass < 8; pass++) {
        const sets = new Map<number, number>();
        const reads = new Map<number, number>();
        countUses(body, sets, reads);
        const single = new Set([...sets].filter(([local, count]) => count === 1 && !accumulators.has(local)).map(([local]) => local));
        const folded = dropAssignments(foldStatements(body, new Map(), single), new Set([...sets.keys()].filter(local => !accumulators.has(local) && (reads.get(local) ?? 0) === 0)));
        const unchanged = JSON.stringify(folded) === JSON.stringify(body);
        body = folded;
        if (unchanged) break;
    }
    return { ...program, body: dropUnchangedStores(body, new Map()) };
};
