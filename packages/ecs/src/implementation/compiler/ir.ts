// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BinaryOperator } from 'estree';
import type { Path, Program } from '../world/kernel.js';
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
    /** Whether this call's archetype has an optional component, by its presence column: the same for every row. */
    | { readonly kind: "present"; readonly column: number }
    /** A column of the row's parent, at the parent's row: `Unit.upColumns`. */
    | { readonly kind: "upColumn"; readonly column: number }
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
    | { readonly kind: "lane"; readonly intrinsic: number; readonly lane: number; readonly value: Expression }
    /** A lookup through an index's list, in the local `list` holds, and its rows, in the locals `row` holds: as in `Program`. */
    | { readonly kind: "listLength"; readonly list: number; readonly lookup: number }
    | { readonly kind: "listChanged"; readonly list: number; readonly lookup: number }
    | { readonly kind: "rowLeaf"; readonly row: number; readonly lookup: number; readonly leaf: number }
    | { readonly kind: "rowEntity"; readonly row: number; readonly lookup: number }
    /** Whether the row in `row` was found: `true` or `null` in JS, so it tests as a lookup's result does. */
    | { readonly kind: "rowFound"; readonly row: number; readonly lookup: number }
    // JS only:
    | { readonly kind: "nullish"; readonly value: "null" | "undefined" }
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "element"; readonly object: Expression; readonly index: Expression; readonly optional: boolean }
    | { readonly kind: "array"; readonly items: readonly Expression[] }
    | { readonly kind: "record"; readonly fields: readonly (readonly [string, Expression])[] };

export type Statement =
    | { readonly kind: "set"; readonly local: number; readonly value: Expression; readonly declare: "const" | "let" | undefined }
    /** Declares `let` locals that every path assigns before reading. */
    | { readonly kind: "declare"; readonly locals: readonly number[] }
    | { readonly kind: "store"; readonly column: number; readonly value: Expression }
    /** Stamps a changed column at the row, and its chunk and block columns at the row's chunk and block. */
    | { readonly kind: "stamp"; readonly column: number; readonly chunks: number; readonly blocks: number }
    | { readonly kind: "if"; readonly test: Expression; readonly consequent: Out; readonly alternate: Out }
    | { readonly kind: "block"; readonly label: number; readonly body: Out }
    | { readonly kind: "loop"; readonly label: number; readonly body: Out }
    | { readonly kind: "branch"; readonly label: number }
    | { readonly kind: "branchIf"; readonly label: number; readonly test: Expression }
    | { readonly kind: "next" }
    /** An intrinsic region, as in `Program`; only GPU kernels have them. */
    | { readonly kind: "intrinsic"; readonly id: number; readonly name: string; readonly intrinsic: Program.Intrinsic; readonly operands: readonly (readonly Expression[])[]; readonly body: Out }
    /** A lookup through an index, as in `Program`, by `probe`, into the locals `list` and `first` hold. */
    | { readonly kind: "probe"; readonly list: number; readonly first: number; readonly lookup: number; readonly probe: number; readonly values: readonly Expression[] }
    | { readonly kind: "listRow"; readonly row: number; readonly list: number; readonly lookup: number; readonly index: Expression }
    // JS only:
    | { readonly kind: "lookup"; readonly local: number; readonly lookup: number; readonly entity: Expression }
    /**
     * `KernelCommands`: `spawn` stages a spawn through spawner `list`, an index into `Unit.spawns`, with one value per
     * component of the list, into `local`; `begin` starts a despawn (1), add (2) or remove (3).
     */
    | { readonly kind: "spawn"; readonly local: number; readonly list: number; readonly values: readonly Expression[] }
    | { readonly kind: "begin"; readonly command: 1 | 2 | 3; readonly entity: Expression }
    /** A component (index into `keys`) and its value for the current spawn or add. */
    | { readonly kind: "value"; readonly key: number; readonly value: Expression }
    /** A component (index into `keys`) for the current remove. */
    | { readonly kind: "component"; readonly key: number };

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
        case "observe": case "lane": return references(expression.value, matches);
        case "element": return references(expression.object, matches) || references(expression.index, matches);
        case "array": return expression.items.some(item => references(item, matches));
        case "record": return expression.fields.some(([, item]) => references(item, matches));
        default: return false;
    }
};
