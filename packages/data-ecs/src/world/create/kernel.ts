import type { Entity } from '../../entity/entity.js';
import type { Commands } from '../../system/commands.js';

type Key = string | symbol;

/** A path from a component's value to one scalar leaf: `[]` for a scalar, `[1]` for a tuple element, `["x"]` for a struct field. */
export type Path = readonly (number | string)[];

/** One typed array the kernel receives, in `columns` order. */
export type Column =
    /** Float64Array of the row's entity. */
    | { readonly kind: "entity" }
    /** The typed array of one scalar leaf. Registration checks the path names a scalar leaf of the schema. */
    | { readonly kind: "field"; readonly component: Key; readonly path: Path }
    /** Float64Array of the component's changed ticks, stamped with `tick` on each write. */
    | { readonly kind: "changed"; readonly component: Key };

/** A whole-value write assumed exactly these leaves. Registration checks they are all of the schema's leaves. */
export type Shape = { readonly component: Key; readonly leaves: readonly Path[] };

/**
 * Processes rows `start` to `end` (exclusive). Change filters are applied by the caller, which passes only passing ranges.
 * - `resources`: values in `KernelDescription.resources` order.
 * - `lookups`: functions in `KernelDescription.lookups` order, returning the lookup's `read` values in declared order, or `null`.
 * - `keys`: what command values use to name components: `KernelDescription.keys` on the main thread, component ids in workers.
 */
export type Kernel = (
    columns: readonly (Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array)[],
    start: number,
    end: number,
    resources: readonly unknown[],
    lookups: readonly ((entity: Entity) => readonly unknown[] | null)[],
    keys: readonly (Key | number)[],
    args: unknown,
    commands: Commands,
    tick: number,
) => void;

/**
 * A kernel's row body as data, for generating WASM at registration. Every value is a number: booleans are 0 or 1,
 * typed as booleans where the generator needs to tell them apart. Control flow mirrors WASM's structured blocks.
 */
export namespace Program {
    export type Expression =
        | { readonly kind: "number"; readonly value: number }
        | { readonly kind: "boolean"; readonly value: boolean }
        /** `columns[column][row]`, an entity or field column. */
        | { readonly kind: "column"; readonly column: number }
        /** A scalar inside `resources[index]`, or inside `args`. */
        | { readonly kind: "resource"; readonly index: number; readonly path: Path }
        | { readonly kind: "args"; readonly path: Path }
        | { readonly kind: "local"; readonly local: number }
        | { readonly kind: "unary"; readonly operator: "-" | "+" | "!" | "~"; readonly operand: Expression }
        | {
            readonly kind: "binary";
            readonly operator: "+" | "-" | "*" | "/" | "%" | "**" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "===" | "!==" | "&" | "|" | "^" | "<<" | ">>" | ">>>";
            readonly left: Expression;
            readonly right: Expression;
        }
        /** JS semantics: the result is an operand's value, not a boolean. */
        | { readonly kind: "logical"; readonly operator: "&&" | "||"; readonly left: Expression; readonly right: Expression }
        | { readonly kind: "conditional"; readonly test: Expression; readonly consequent: Expression; readonly alternate: Expression }
        /** `Math[name](...arguments)`; Math constants are emitted as numbers. */
        | { readonly kind: "math"; readonly name: string; readonly arguments: readonly Expression[] };

    export type Statement =
        | { readonly kind: "set"; readonly local: number; readonly value: Expression }
        /** `columns[column][row] = value`, with typed-array conversion. */
        | { readonly kind: "store"; readonly column: number; readonly value: Expression }
        /** `columns[column][row] = tick`, for a changed column. */
        | { readonly kind: "stamp"; readonly column: number }
        | { readonly kind: "if"; readonly test: Expression; readonly consequent: readonly Statement[]; readonly alternate: readonly Statement[] }
        /** WASM `block`: a branch to it exits it. */
        | { readonly kind: "block"; readonly body: readonly Statement[] }
        /** WASM `loop`: a branch to it starts it again; falling off the end exits it. */
        | { readonly kind: "loop"; readonly body: readonly Statement[] }
        /** WASM `br`/`br_if`: `depth` 0 is the innermost enclosing block or loop. */
        | { readonly kind: "branch"; readonly depth: number }
        | { readonly kind: "branchIf"; readonly depth: number; readonly test: Expression }
        /** Ends the current row. */
        | { readonly kind: "next" };
}

/** Scalar locals and the row body, in the order JS evaluates it. */
export type Program = { readonly locals: number; readonly body: readonly Program.Statement[] };

/** What the compiler emits for one kernel system. */
export type KernelDescription = {
    readonly columns: readonly Column[];
    readonly shapes: readonly Shape[];
    readonly resources: readonly Key[];
    readonly lookups: readonly string[];
    readonly keys: readonly Key[];
    /** A module exporting `create`, importable from the main thread and from workers. */
    readonly url: string;
    /** The same body for WASM, or `null` when it uses what WASM kernels don't support: commands, lookups, or non-scalar values. */
    readonly program: Program | null;
};

/** What a kernel module at `KernelDescription.url` exports. */
export type KernelModule = {
    /** Called once per registration. `booleans[k]` is true when column `k` stores booleans as 0 or 1, so reads convert them. */
    readonly create: (booleans: readonly boolean[]) => Kernel;
};
