import type { Entity } from '../../entity/entity.js';

type Key = string | symbol;

/** A path from a component's value to one scalar leaf: `[]` for a scalar, `[1]` for a tuple element, `["x"]` for a struct field. */
export type Path = readonly (number | string)[];

/**
 * One typed array the kernel receives, in `columns` order. A row's element is at `row * strides[k] + offsets[k]`
 * (see `KernelModule.create`): a component's values are interleaved in its column, so a field is a strided view of its bytes.
 */
export type Column =
    /** Float64Array of the row's entity. */
    | { readonly kind: "entity" }
    /** A view of one scalar leaf. Registration checks the path names a scalar leaf of the schema. */
    | { readonly kind: "field"; readonly component: Key; readonly path: Path }
    /** Float64Array of the component's changed ticks, stamped with `tick` on each write. */
    | { readonly kind: "changed"; readonly component: Key }
    /**
     * Float64Array of the component's newest changed tick per chunk of `chunkRows` rows, so change filters can skip
     * unchanged chunks. Every `changed` column is followed by one, and each stamp sets both: `chunks[row >> chunkShift] = tick`.
     */
    | { readonly kind: "chunks"; readonly component: Key };

/** Rows per chunk of change ticks is `2 ** chunkShift`. */
export const chunkShift = 10;

/** A whole-value write assumed exactly these leaves. Registration checks they are all of the schema's leaves. */
export type Shape = { readonly component: Key; readonly leaves: readonly Path[] };

/**
 * Processes rows `start` to `end` (exclusive). Change filters are applied by the caller, which passes only passing ranges.
 * - `resources`: values in `KernelDescription.resources` order.
 * - `lookups`: functions in `KernelDescription.lookups` order, returning the lookup's `read` values in declared order, or `null`.
 * - `keys`: `KernelDescription.keys`, for anything that needs a component's key.
 * - `commands`: issue commands without allocating: values are evaluated first, then `begin` (or `spawn`), then each `value`
 *   or `component`, naming components by index into `keys`.
 */
export type Kernel = (
    columns: readonly (Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array)[],
    start: number,
    end: number,
    resources: readonly unknown[],
    lookups: readonly ((entity: Entity) => readonly unknown[] | null)[],
    keys: readonly (Key | number)[],
    args: unknown,
    commands: KernelCommands,
    tick: number,
) => void;

/** How kernels issue commands. `kind` is 1 for despawn, 2 for add, 3 for remove; `key` indexes the kernel's `keys`. */
export type KernelCommands = {
    /** Reserves an entity and starts its spawn command. */
    readonly spawn: () => Entity;
    readonly begin: (kind: number, entity: Entity) => void;
    /** A component and its value for the current spawn or add; `undefined` values are skipped. */
    readonly value: (key: number, value: unknown) => void;
    /** A component for the current remove. */
    readonly component: (key: number) => void;
};

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
        | { readonly kind: "math"; readonly name: string; readonly arguments: readonly Expression[] }
        /** Whether the last `find` into `handle` found a matching entity. */
        | { readonly kind: "found"; readonly handle: number }
        /**
         * A scalar leaf of a found entity: component `read` (an index into the lookup's `read` list), at `path` within it.
         * Reads NaN if nothing was found, as `undefined` does in arithmetic.
         */
        | { readonly kind: "lookupLeaf"; readonly handle: number; readonly read: number; readonly path: Path };

    export type Statement =
        | { readonly kind: "set"; readonly local: number; readonly value: Expression }
        /** `columns[column][row] = value`, with typed-array conversion. */
        | { readonly kind: "store"; readonly column: number; readonly value: Expression }
        /** `columns[column][row] = tick` and `columns[chunks][row >> chunkShift] = tick`, for a changed column and its chunk column. */
        | { readonly kind: "stamp"; readonly column: number; readonly chunks: number }
        | { readonly kind: "if"; readonly test: Expression; readonly consequent: readonly Statement[]; readonly alternate: readonly Statement[] }
        /** WASM `block`: a branch to it exits it. */
        | { readonly kind: "block"; readonly body: readonly Statement[] }
        /** WASM `loop`: a branch to it starts it again; falling off the end exits it. */
        | { readonly kind: "loop"; readonly body: readonly Statement[] }
        /** WASM `br`/`br_if`: `depth` 0 is the innermost enclosing block or loop. */
        | { readonly kind: "branch"; readonly depth: number }
        | { readonly kind: "branchIf"; readonly depth: number; readonly test: Expression }
        /** Ends the current row. */
        | { readonly kind: "next" }
        /** Looks `entity` up through lookup `lookup` (an index into `KernelDescription.lookups`), into `handle`. */
        | { readonly kind: "find"; readonly handle: number; readonly lookup: number; readonly entity: Expression };
}

/**
 * Scalar locals, lookup handles, and the row body, in the order JS evaluates it. `names` are the locals' JS names,
 * for readable generated code; GPU kernels carry them.
 */
export type Program = { readonly locals: number; readonly handles?: number; readonly names?: readonly string[]; readonly body: readonly Program.Statement[] };

/** What the compiler emits for one kernel system. */
export type KernelDescription = {
    readonly columns: readonly Column[];
    readonly shapes: readonly Shape[];
    readonly resources: readonly Key[];
    readonly lookups: readonly string[];
    readonly keys: readonly Key[];
    /** A module exporting `create`, importable from the main thread and from workers. */
    readonly url: string;
    /** The same body for WASM, or `null` when it uses what WASM kernels don't support: commands, or non-scalar values. */
    readonly program: Program | null;
};

/** What a kernel module at `KernelDescription.url` exports. */
export type KernelModule = {
    /**
     * Called once per registration. Per column `k`: `booleans[k]` is true when it stores booleans as 0 or 1, so reads convert them;
     * a row's element is at `row * strides[k] + offsets[k]`, in elements of the column's array.
     */
    readonly create: (booleans: readonly boolean[], strides: readonly number[], offsets: readonly number[]) => Kernel;
};
