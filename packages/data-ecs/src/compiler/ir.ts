import type { BinaryOperator } from 'estree';
import type { Path } from '../world/create/kernel.js';
import type { Out } from './out.js';

export type Binary = Exclude<BinaryOperator, "in" | "instanceof">;
export type Unary = "-" | "+" | "!" | "~";

const unaryOperators: ReadonlySet<string> = new Set(["-", "+", "!", "~"]);
const binaryOperators: ReadonlySet<string> = new Set([
    "+", "-", "*", "/", "%", "**", "<", ">", "<=", ">=", "==", "!=", "===", "!==", "&", "|", "^", "<<", ">>", ">>>",
]);

export const isUnary = (operator: string): operator is Unary => unaryOperators.has(operator);
export const isBinary = (operator: string): operator is Binary => binaryOperators.has(operator);

/**
 * The lowered kernel body: the `Program` subset plus JS-only nodes (lookups, commands, nullish values, runtime
 * indexing, JS values). JS is printed from it; a `Program` is derived from it when it has no JS-only nodes.
 * Locals and labels are unit-unique numbers.
 */
export type Expression =
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "boolean"; readonly value: boolean }
    | { readonly kind: "column"; readonly column: number }
    | { readonly kind: "resource"; readonly index: number; readonly path: Path }
    | { readonly kind: "args"; readonly path: Path }
    | { readonly kind: "local"; readonly local: number }
    | { readonly kind: "unary"; readonly operator: Unary; readonly operand: Expression }
    | { readonly kind: "binary"; readonly operator: Binary; readonly left: Expression; readonly right: Expression }
    | { readonly kind: "logical"; readonly operator: "&&" | "||" | "??"; readonly left: Expression; readonly right: Expression }
    | { readonly kind: "conditional"; readonly test: Expression; readonly consequent: Expression; readonly alternate: Expression }
    | { readonly kind: "math"; readonly name: string; readonly arguments: readonly Expression[] }
    /** Reads inside convert boolean columns to booleans: a position where `true` and `1` differ. */
    | { readonly kind: "observe"; readonly value: Expression }
    // JS only:
    | { readonly kind: "nullish"; readonly value: "null" | "undefined" }
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "element"; readonly object: Expression; readonly index: Expression; readonly optional: boolean }
    | { readonly kind: "array"; readonly items: readonly Expression[] }
    | { readonly kind: "record"; readonly fields: readonly (readonly [string, Expression])[] }
    /** Command values: `{ [keys[key]]: value }`. */
    | { readonly kind: "components"; readonly entries: readonly (readonly [number, Expression])[] };

export type Statement =
    | { readonly kind: "set"; readonly local: number; readonly value: Expression; readonly declare: "const" | "let" | undefined }
    /** Declares `let` locals that every path assigns before reading. */
    | { readonly kind: "declare"; readonly locals: readonly number[] }
    | { readonly kind: "store"; readonly column: number; readonly value: Expression }
    | { readonly kind: "stamp"; readonly column: number }
    | { readonly kind: "if"; readonly test: Expression; readonly consequent: Out; readonly alternate: Out }
    | { readonly kind: "block"; readonly label: number; readonly body: Out }
    | { readonly kind: "loop"; readonly label: number; readonly body: Out }
    | { readonly kind: "branch"; readonly label: number }
    | { readonly kind: "branchIf"; readonly label: number; readonly test: Expression }
    | { readonly kind: "next" }
    // JS only:
    | { readonly kind: "lookup"; readonly local: number; readonly lookup: number; readonly entity: Expression }
    | { readonly kind: "spawn"; readonly local: number; readonly values: Expression }
    | { readonly kind: "despawn"; readonly entity: Expression }
    | { readonly kind: "add"; readonly entity: Expression; readonly values: Expression }
    | { readonly kind: "remove"; readonly entity: Expression; readonly keys: readonly number[] };

export const number = (value: number): Expression => ({ kind: "number", value });
export const local = (index: number): Expression => ({ kind: "local", local: index });
export const not = (operand: Expression): Expression => ({ kind: "unary", operator: "!", operand });

/** Whether `expression` reads anything `matches`. */
export const references = (expression: Expression, matches: (node: Expression) => boolean): boolean => {
    if (matches(expression)) return true;
    switch (expression.kind) {
        case "unary": return references(expression.operand, matches);
        case "binary": case "logical": return references(expression.left, matches) || references(expression.right, matches);
        case "conditional": return [expression.test, expression.consequent, expression.alternate].some(item => references(item, matches));
        case "math": return expression.arguments.some(item => references(item, matches));
        case "observe": return references(expression.value, matches);
        case "element": return references(expression.object, matches) || references(expression.index, matches);
        case "array": return expression.items.some(item => references(item, matches));
        case "record": return expression.fields.some(([, item]) => references(item, matches));
        case "components": return expression.entries.some(([, item]) => references(item, matches));
        default: return false;
    }
};
