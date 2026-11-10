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
        case "resourceElement": return { ...expression, element: fold(expression.element) };
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
            case "resourceElement": read(expression.element); return;
            default: return;
        }
    };
    for (const statement of statements) {
        switch (statement.kind) {
            case "set": sets.set(statement.local, (sets.get(statement.local) ?? 0) + 1); read(statement.value); break;
            case "store": read(statement.value); break;
            case "resourceStore": read(statement.element); read(statement.value); break;
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
            case "resourceStore": result.push({ ...statement, element: fold(statement.element), value: fold(statement.value) }); break;
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

/**
 * Statements with what both arms of an `if` end with moved after it, as either arm runs them last, and an `if` left
 * with nothing in either arm dropped, its test being pure. `if`s count toward no branch depth, so a branch moves too.
 */
const mergeTails = (statements: readonly Statement[]): Statement[] => statements.flatMap((statement): Statement[] => {
    switch (statement.kind) {
        case "if": {
            const consequent = mergeTails(statement.consequent);
            const alternate = mergeTails(statement.alternate);
            let shared = 0;
            while (shared < consequent.length && shared < alternate.length
                && JSON.stringify(consequent[consequent.length - 1 - shared]) === JSON.stringify(alternate[alternate.length - 1 - shared])) shared++;
            const tail = consequent.slice(consequent.length - shared);
            const kept = { ...statement, consequent: consequent.slice(0, consequent.length - shared), alternate: alternate.slice(0, alternate.length - shared) };
            return [...kept.consequent.length === 0 && kept.alternate.length === 0 ? [] : [kept], ...tail];
        }
        case "block": case "loop": case "intrinsic": return [{ ...statement, body: mergeTails(statement.body) }];
        default: return [statement];
    }
});

/** An expression with its reads of locals `renamed` maps read as the locals they map to. */
const renameExpression = (expression: Expression, renamed: ReadonlyMap<number, number>): Expression => {
    switch (expression.kind) {
        case "local": return { ...expression, local: renamed.get(expression.local) ?? expression.local };
        case "unary": return { ...expression, operand: renameExpression(expression.operand, renamed) };
        case "binary": case "logical": return { ...expression, left: renameExpression(expression.left, renamed), right: renameExpression(expression.right, renamed) };
        case "conditional": return { ...expression, test: renameExpression(expression.test, renamed), consequent: renameExpression(expression.consequent, renamed), alternate: renameExpression(expression.alternate, renamed) };
        case "math": return { ...expression, arguments: expression.arguments.map(argument => renameExpression(argument, renamed)) };
        case "lane": return { ...expression, value: renameExpression(expression.value, renamed) };
        case "resourceElement": return { ...expression, element: renameExpression(expression.element, renamed) };
        default: return expression;
    }
};

/** Statements with their reads of locals renamed, in every expression they hold. */
const renameStatements = (statements: readonly Statement[], renamed: ReadonlyMap<number, number>): Statement[] => statements.map((statement): Statement => {
    const rename = (expression: Expression): Expression => renameExpression(expression, renamed);
    switch (statement.kind) {
        case "set": return { ...statement, value: rename(statement.value) };
        case "store": return { ...statement, value: rename(statement.value) };
        case "resourceStore": return { ...statement, element: rename(statement.element), value: rename(statement.value) };
        case "if": return { ...statement, test: rename(statement.test), consequent: renameStatements(statement.consequent, renamed), alternate: renameStatements(statement.alternate, renamed) };
        case "block": case "loop": return { ...statement, body: renameStatements(statement.body, renamed) };
        case "branchIf": return { ...statement, test: rename(statement.test) };
        case "find": return { ...statement, entity: rename(statement.entity) };
        case "probe": return { ...statement, values: statement.values.map(rename) };
        case "listRow": return { ...statement, index: rename(statement.index) };
        case "intrinsic": return { ...statement, operands: statement.operands.map(lanes => lanes.map(rename)), body: renameStatements(statement.body, renamed) };
        default: return statement;
    }
});

/** Of an arm, the index of each `set` its arm's earlier statements leave free to run before the `if`, by what it reads. */
const movable = (arm: readonly Statement[], index: number, single: ReadonlySet<number>): boolean => {
    const statement = arm[index];
    if (statement === undefined || statement.kind !== "set" || !single.has(statement.local)) return false;
    const locals = new Set<number>();
    const columns = new Set<number>();
    return readsOf(statement.value, locals, columns) && !changes(arm.slice(0, index), locals, columns);
};

/**
 * Statements with what both arms of an `if` compute alike run once before it: a `set` of the first arm whose value,
 * nothing before it in the arm changes, is that of a `set` of the second, its locals read as the first's, moves out
 * and the second's local reads as the first's. Arms left choosing between a few values run without a branch.
 */
const hoistCommon = (statements: readonly Statement[], single: ReadonlySet<number>): Statement[] => statements.flatMap((statement): Statement[] => {
    if (statement.kind === "block" || statement.kind === "loop") return [{ ...statement, body: hoistCommon(statement.body, single) }];
    if (statement.kind !== "if") return [statement];
    let consequent = hoistCommon(statement.consequent, single);
    let alternate = hoistCommon(statement.alternate, single);
    const hoisted: Statement[] = [];
    for (let moved = true; moved;) {
        moved = false;
        for (let first = 0; first < consequent.length && !moved; first++) {
            const own = consequent[first];
            if (own === undefined || own.kind !== "set" || !movable(consequent, first, single)) continue;
            const value = JSON.stringify(own.value);
            const second = alternate.findIndex((other, index) => other.kind === "set" && JSON.stringify(other.value) === value && movable(alternate, index, single));
            const other = alternate[second];
            if (other === undefined || other.kind !== "set") continue;
            hoisted.push(own);
            consequent = consequent.filter((_, index) => index !== first);
            alternate = renameStatements(alternate.filter((_, index) => index !== second), new Map([[other.local, own.local]]));
            moved = true;
        }
    }
    return [...hoisted, { ...statement, consequent, alternate }];
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
 * Assignments to locals nothing reads any more are dropped, and stores of a value a column already holds, and what
 * both arms of an `if` end with runs once after it. Accumulators keep every assignment.
 */
/** What a value reads, its locals and columns, or null where it reads anything else, which may change as statements run. */
const readsOf = (expression: Expression, locals: Set<number>, columns: Set<number>): boolean => {
    switch (expression.kind) {
        case "number": case "boolean": case "resource": case "args": case "shared": return true;
        case "local": locals.add(expression.local); return true;
        case "column": columns.add(expression.column); return true;
        case "unary": return readsOf(expression.operand, locals, columns);
        case "binary": case "logical": return readsOf(expression.left, locals, columns) && readsOf(expression.right, locals, columns);
        case "conditional": return readsOf(expression.test, locals, columns) && readsOf(expression.consequent, locals, columns) && readsOf(expression.alternate, locals, columns);
        case "math": return pure.has(expression.name) && expression.arguments.every(argument => readsOf(argument, locals, columns));
        default: return false;
    }
};

/** How many times statements read a local, in every expression they hold. */
const readsOfLocal = (statements: readonly Statement[], local: number): number => {
    const reads = new Map<number, number>();
    countUses(statements, new Map(), reads);
    return reads.get(local) ?? 0;
};

/** Whether statements may change a value reading `locals` and `columns`: they set one of the locals, or store anything else. */
const changes = (statements: readonly Statement[], locals: ReadonlySet<number>, columns: ReadonlySet<number>): boolean => statements.some(statement => {
    switch (statement.kind) {
        case "set": return locals.has(statement.local);
        case "store": return columns.has(statement.column);
        case "stamp": case "branchIf": case "next": return false;
        case "if": return changes(statement.consequent, locals, columns) || changes(statement.alternate, locals, columns);
        case "block": case "loop": return changes(statement.body, locals, columns);
        default: return true;
    }
});

/**
 * Statements with each assignment of a local assigned once, whose value reads only row columns and locals, moved into the
 * arm of a later `if` that holds every read of it, where nothing between changes what it reads: rows taking the other
 * arm don't compute it, nor read its columns.
 */
const sinkAssignments = (statements: readonly Statement[], single: ReadonlySet<number>): Statement[] => {
    const result = [...statements];
    for (let index = result.length - 1; index >= 0; index--) {
        const statement = result[index];
        if (statement === undefined || statement.kind !== "set" || !single.has(statement.local)) continue;
        const locals = new Set<number>();
        const columns = new Set<number>();
        if (!readsOf(statement.value, locals, columns)) continue;
        const { local } = statement;
        const later = result.slice(index + 1);
        const reading = later.findIndex(next => readsOfLocal([next], local) > 0);
        const target = later[reading];
        if (target === undefined || target.kind !== "if" || readsOfLocal(later.slice(reading + 1), local) > 0) continue;
        if (changes(later.slice(0, reading), locals, columns)) continue;
        const total = readsOfLocal([target], local);
        const arm = readsOfLocal(target.consequent, local) === total ? "consequent" : readsOfLocal(target.alternate, local) === total ? "alternate" : null;
        if (arm === null) continue;
        result.splice(index + 1 + reading, 1, { ...target, [arm]: [statement, ...target[arm]] });
        result.splice(index, 1);
    }
    return result.map(statement => statement.kind === "if"
        ? { ...statement, consequent: sinkAssignments(statement.consequent, single), alternate: sinkAssignments(statement.alternate, single) }
        : statement);
};

export const simplifyProgram = (program: Program): Program => {
    const accumulators = new Set(program.reductions ?? []);
    let body = program.body;
    for (let pass = 0; pass < 8; pass++) {
        const sets = new Map<number, number>();
        const reads = new Map<number, number>();
        countUses(body, sets, reads);
        const single = new Set([...sets].filter(([local, count]) => count === 1 && !accumulators.has(local)).map(([local]) => local));
        const folded = dropAssignments(foldStatements(mergeTails(hoistCommon(body, single)), new Map(), single), new Set([...sets.keys()].filter(local => !accumulators.has(local) && (reads.get(local) ?? 0) === 0)));
        const unchanged = JSON.stringify(folded) === JSON.stringify(body);
        body = folded;
        if (unchanged) break;
    }
    const stored = dropUnchangedStores(body, new Map());
    // Locals read only by the stores dropped are left unread.
    const sets = new Map<number, number>();
    const reads = new Map<number, number>();
    countUses(stored, sets, reads);
    const kept = dropAssignments(stored, new Set([...sets.keys()].filter(local => !accumulators.has(local) && (reads.get(local) ?? 0) === 0)));
    const single = new Set([...sets].filter(([local, count]) => count === 1 && !accumulators.has(local)).map(([local]) => local));
    return { ...program, body: sinkAssignments(kept, single) };
};
