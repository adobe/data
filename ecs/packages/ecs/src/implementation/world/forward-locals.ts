// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Program } from './kernel.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/** Whether a value is the same wherever it's read in a run: a literal, or a leaf of a resource, the input or a shared value. */
const constant = (expression: Expression): boolean =>
    expression.kind === "number" || expression.kind === "boolean" || expression.kind === "resource" || expression.kind === "args" || expression.kind === "shared";

/** Whether a value only reads locals, row columns and constants, adding them to `locals` and `columns`. */
const readsOnly = (expression: Expression, locals: Set<number>, columns: Set<number>): boolean => {
    switch (expression.kind) {
        case "number": case "boolean": case "resource": case "args": case "shared": return true;
        case "local": locals.add(expression.local); return true;
        case "column": columns.add(expression.column); return true;
        case "unary": return readsOnly(expression.operand, locals, columns);
        case "binary": case "logical": return readsOnly(expression.left, locals, columns) && readsOnly(expression.right, locals, columns);
        case "conditional": return readsOnly(expression.test, locals, columns) && readsOnly(expression.consequent, locals, columns) && readsOnly(expression.alternate, locals, columns);
        case "math": return expression.arguments.every(argument => readsOnly(argument, locals, columns));
        default: return false;
    }
};

/** An expression with each read of `local` replaced by `value`, and how many it replaced, in `count`. */
const replaceIn = (expression: Expression, local: number, value: Expression, count: { n: number }): Expression => {
    const replace = (inner: Expression): Expression => replaceIn(inner, local, value, count);
    switch (expression.kind) {
        case "local":
            if (expression.local !== local) return expression;
            count.n++;
            return value;
        case "unary": return { ...expression, operand: replace(expression.operand) };
        case "binary": case "logical": return { ...expression, left: replace(expression.left), right: replace(expression.right) };
        case "conditional": return { ...expression, test: replace(expression.test), consequent: replace(expression.consequent), alternate: replace(expression.alternate) };
        case "math": return { ...expression, arguments: expression.arguments.map(replace) };
        case "lane": return { ...expression, value: replace(expression.value) };
        case "resourceElement": return { ...expression, element: replace(expression.element) };
        default: return expression;
    }
};

/** Statements with each read of `local` replaced by `value`, nested ones too. */
const replaceInStatements = (statements: readonly Statement[], local: number, value: Expression, count: { n: number }): Statement[] => statements.map(statement => {
    const expression = (inner: Expression): Expression => replaceIn(inner, local, value, count);
    const nested = (inner: readonly Statement[]): Statement[] => replaceInStatements(inner, local, value, count);
    switch (statement.kind) {
        case "set": case "store": return { ...statement, value: expression(statement.value) };
        case "resourceStore": return { ...statement, element: expression(statement.element), value: expression(statement.value) };
        case "if": return { ...statement, test: expression(statement.test), consequent: nested(statement.consequent), alternate: nested(statement.alternate) };
        case "block": case "loop": return { ...statement, body: nested(statement.body) };
        case "branchIf": return { ...statement, test: expression(statement.test) };
        case "find": return { ...statement, entity: expression(statement.entity) };
        case "probe": return { ...statement, values: statement.values.map(expression) };
        case "listRow": return { ...statement, index: expression(statement.index) };
        case "intrinsic": return { ...statement, operands: statement.operands.map(lanes => lanes.map(expression)), body: nested(statement.body) };
        default: return statement;
    }
});

/** A statement's own expressions with each read of `local` replaced, not those of statements nested in it. */
const replaceInOwn = (statement: Statement, local: number, value: Expression, count: { n: number }): Statement | null => {
    const expression = (inner: Expression): Expression => replaceIn(inner, local, value, count);
    switch (statement.kind) {
        case "set": case "store": return { ...statement, value: expression(statement.value) };
        case "if": return { ...statement, test: expression(statement.test) };
        default: return null;
    }
};

const countUses = (statements: readonly Statement[], sets: Map<number, number>, reads: Map<number, number>): void => {
    for (const statement of statements) {
        if (statement.kind === "set") sets.set(statement.local, (sets.get(statement.local) ?? 0) + 1);
        const visit = (expression: Expression): void => {
            switch (expression.kind) {
                case "local": reads.set(expression.local, (reads.get(expression.local) ?? 0) + 1); return;
                case "unary": return visit(expression.operand);
                case "binary": case "logical": visit(expression.left); return visit(expression.right);
                case "conditional": visit(expression.test); visit(expression.consequent); return visit(expression.alternate);
                case "math": return expression.arguments.forEach(visit);
                case "lane": return visit(expression.value);
                case "resourceElement": return visit(expression.element);
                default: return;
            }
        };
        switch (statement.kind) {
            case "set": case "store": visit(statement.value); break;
            case "resourceStore": visit(statement.element); visit(statement.value); break;
            case "if": visit(statement.test); countUses(statement.consequent, sets, reads); countUses(statement.alternate, sets, reads); break;
            case "block": case "loop": countUses(statement.body, sets, reads); break;
            case "branchIf": visit(statement.test); break;
            case "find": visit(statement.entity); break;
            case "probe": statement.values.forEach(visit); break;
            case "listRow": visit(statement.index); break;
            case "intrinsic": statement.operands.forEach(lanes => lanes.forEach(visit)); countUses(statement.body, sets, reads); break;
            default: break;
        }
    }
};

/**
 * The program with values written into the reads of the locals holding them, so each store holds its whole value, as
 * nested calls inlined into temporaries don't: a local assigned once a constant, into every read after it; and one
 * assigned once a value of row columns, constants and locals and read once, into its read in a later statement of the
 * same list when nothing between changes what the value reads. `aliases` is whether two columns hold the same bytes.
 * Accumulators keep their assignments.
 */
export const forwardLocals = (program: Program, aliases: (a: number, b: number) => boolean): Program => {
    const accumulators = new Set(program.reductions ?? []);
    const changes = (between: readonly Statement[], locals: ReadonlySet<number>, columns: ReadonlySet<number>): boolean => between.some(statement => {
        switch (statement.kind) {
            case "set": return locals.has(statement.local);
            case "store": return [...columns].some(column => aliases(column, statement.column));
            case "stamp": return false;
            default: return true;
        }
    });
    let body = program.body;
    for (let pass = 0; pass < 64; pass++) {
        const sets = new Map<number, number>();
        const reads = new Map<number, number>();
        countUses(body, sets, reads);
        let changed = false;
        const visit = (statements: readonly Statement[]): Statement[] => {
            const list: Statement[] = statements.map((statement): Statement => {
                switch (statement.kind) {
                    case "if": return { ...statement, consequent: visit(statement.consequent), alternate: visit(statement.alternate) };
                    case "block": case "loop": return { ...statement, body: visit(statement.body) };
                    default: return statement;
                }
            });
            for (let index = 0; index < list.length; index++) {
                const statement = list[index];
                if (statement === undefined || statement.kind !== "set" || sets.get(statement.local) !== 1 || accumulators.has(statement.local)) continue;
                const { local, value } = statement;
                const total = reads.get(local) ?? 0;
                if (total === 0) continue;
                const later = list.slice(index + 1);
                if (constant(value)) {
                    const count = { n: 0 };
                    const replaced = replaceInStatements(later, local, value, count);
                    if (count.n !== total) continue;
                    list.splice(index, list.length - index, ...replaced);
                    changed = true;
                    index--;
                    continue;
                }
                const locals = new Set<number>();
                const columns = new Set<number>();
                if (total !== 1 || locals.has(local) || !readsOnly(value, locals, columns)) continue;
                const reader = later.findIndex(next => {
                    const count = { n: 0 };
                    replaceInStatements([next], local, value, count);
                    return count.n > 0;
                });
                const target = later[reader];
                if (target === undefined || changes(later.slice(0, reader), locals, columns)) continue;
                const count = { n: 0 };
                const replaced = replaceInOwn(target, local, value, count);
                if (replaced === null || count.n !== 1) continue;
                list.splice(index + 1 + reader, 1, replaced);
                list.splice(index, 1);
                changed = true;
                index--;
            }
            return list;
        };
        body = visit(body);
        if (!changed) break;
    }
    return { ...program, body };
};
