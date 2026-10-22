import type { WgslType } from '../../interface/math/intrinsic.js';
import type { Entity } from '../../interface/entity/entity.js';
import type { Reduction } from '../../interface/resource/reduction.js';

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

/** A leaf of a resource a kernel reduces into, folded with `operator`. */
export type Reduced = { readonly resource: Key; readonly operator: Reduction; readonly path: Path };

/** A whole-value write assumed exactly these leaves. Registration checks they are all of the schema's leaves. */
export type Shape = { readonly component: Key; readonly leaves: readonly Path[] };

/**
 * Processes rows `start` to `end` (exclusive). Change filters are applied by the caller, which passes only passing ranges.
 * - `resources`: values in `KernelDescription.resources` order.
 * - `lookups`: functions in `KernelDescription.lookups` order, returning the lookup's `read` values in declared order, or `null`;
 *   for a lookup through an index, its reader (`world/index-readers.ts`).
 * - `keys`: `KernelDescription.keys`, for anything that needs a component's key.
 * - `commands`: issue commands without allocating: values are evaluated first, then `begin`, then each `value` or
 *   `component`, naming components by index into `keys`; a spawn calls its list's spawner with the values.
 */
export type Kernel = (
    columns: readonly (Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array)[],
    start: number,
    end: number,
    resources: readonly unknown[],
    lookups: readonly unknown[],
    keys: readonly (Key | number)[],
    args: unknown,
    commands: KernelCommands,
    tick: number,
    /** Each reduction's partial for this call, at `partial + k`: loaded first, folded into, and stored last. */
    partials: Float64Array,
    partial: number,
    /** For a kernel that reads `up`: the rows it runs are `rows[start]` to `rows[end - 1]`, rather than `start` to `end - 1`. */
    rows?: Int32Array,
    /** Each row's parent row, in the parent archetype every row of the call shares. */
    parents?: Int32Array,
    /** That archetype's columns of `KernelDescription.upColumns`, empty without a parent. */
    upColumns?: readonly (Float64Array | Float32Array | Int32Array | Uint32Array | Uint8Array)[],
    /** Whether the rows have a parent with every component `up` reads. */
    found?: boolean,
) => void;

/** How kernels issue commands. `kind` is 1 for despawn, 2 for add, 3 for remove; `key` indexes the kernel's `keys`. */
export type KernelCommands = {
    /**
     * By index into `KernelDescription.spawns`: stages a spawn of that list's components, taking one value per
     * component in the list's order, `undefined` for its start, and returns the entity it reserved.
     */
    readonly spawners: readonly ((...values: unknown[]) => number)[];
    readonly begin: (kind: number, entity: number) => void;
    /** A component and its value for the current spawn or add; `undefined` is the component's start. */
    readonly value: (key: number, value: unknown) => void;
    /** A component for the current remove. */
    readonly component: (key: number) => void;
};

/**
 * A kernel's row body as data, for generating WASM at registration. Every value is a number: booleans are 0 or 1,
 * typed as booleans where the generator needs to tell them apart. Control flow mirrors WASM's structured blocks.
 */
export namespace Program {
    /** A WGSL value type an intrinsic takes or returns, made of one lane per scalar leaf. */
    export type ValueType = WgslType;

    /** A WGSL builtin a function matches: `operation(operands)`, or an operator between or before them. */
    export type Intrinsic = {
        readonly operation: string;
        readonly form: "call" | "infix" | "prefix";
        readonly parameters: readonly ValueType[];
        readonly result: ValueType;
    };

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
        | { readonly kind: "lookupLeaf"; readonly handle: number; readonly read: number; readonly path: Path }
        /** Whether the rows of the call have a parent with every component `up` reads. */
        | { readonly kind: "upFound" }
        /** `upColumns[column]` at the row's parent row; only under a test proving `upFound`. */
        | { readonly kind: "upLeaf"; readonly column: number }
        /** Lane `lane` of intrinsic region `intrinsic`'s result, which `value` computes from the region's body. */
        | { readonly kind: "lane"; readonly intrinsic: number; readonly lane: number; readonly value: Expression }
        /** How many rows the list in `handle` holds, a lookup through an index's result. */
        | { readonly kind: "listLength"; readonly handle: number }
        /** Whether that list changed since the system last ran (`System`'s `changed` of a list). */
        | { readonly kind: "listChanged"; readonly handle: number }
        /**
         * A scalar leaf of a row a lookup through an index gave, in row handle `handle`: `KernelDescription.rowLeaves[leaf]`.
         * Reads NaN for no row.
         */
        | { readonly kind: "rowLeaf"; readonly handle: number; readonly leaf: number }
        /** The entity of that row, or NaN for no row. */
        | { readonly kind: "rowEntity"; readonly handle: number };

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
        | { readonly kind: "find"; readonly handle: number; readonly lookup: number; readonly entity: Expression }
        /**
         * Looks the key `values` give up through `KernelDescription.probes[probe]`'s index, into list handle `list`, and
         * its first row into row handle `first`, found when the list isn't empty.
         */
        | { readonly kind: "probe"; readonly list: number; readonly first: number; readonly probe: number; readonly values: readonly Expression[] }
        /** Row `index` of list handle `list`, into row handle `row`, found when it's within the list. */
        | { readonly kind: "listRow"; readonly row: number; readonly list: number; readonly index: Expression }
        /**
         * A call to a function that matches a WGSL builtin. `body` is the function inlined; `operands` are its arguments'
         * lanes. WGSL emits the builtin and reads its result's lanes; other backends run `body` and read each lane's `value`.
         */
        | { readonly kind: "intrinsic"; readonly id: number; readonly name: string; readonly intrinsic: Intrinsic; readonly operands: readonly (readonly Expression[])[]; readonly body: readonly Statement[] };
}

/**
 * Scalar locals, lookup handles, and the row body, in the order JS evaluates it. `names` are the locals' JS names,
 * for readable generated code; GPU kernels carry them, and their intrinsic regions.
 */
export type Program = {
    readonly locals: number;
    /** Runs a list of rows, each with its parent's row for `up`, reading the parent's columns through `upLeaf`. */
    readonly up?: true;
    readonly handles?: number;
    readonly names?: readonly string[];
    /** Every intrinsic region's id is below it; absent when there are none. */
    readonly intrinsics?: number;
    /**
     * Accumulator locals, in `KernelDescription.reductions` order: each starts a call at its partial and ends it
     * there, and the body folds values into it.
     */
    readonly reductions?: readonly number[];
    readonly body: readonly Program.Statement[];
};

/**
 * How a call of a lookup through an index gives its key: per argument, a key part's value by the paths of its scalar
 * leaves, in the order the call's values pass them, or for the last, a comparison's operators, each with its operand's.
 */
export type ProbeArgument =
    | { readonly kind: "value"; readonly paths: readonly Path[] }
    | { readonly kind: "comparison"; readonly operators: readonly { readonly operator: string; readonly paths: readonly Path[] }[] };

/** A call site of a lookup through an index: its lookup, an index into `KernelDescription.lookups`, and its arguments. */
export type Probe = { readonly lookup: number; readonly arguments: readonly ProbeArgument[] };

/** What the compiler emits for one kernel system. */
export type KernelDescription = {
    readonly columns: readonly Column[];
    readonly shapes: readonly Shape[];
    readonly resources: readonly Key[];
    readonly lookups: readonly string[];
    /** Each call site of a lookup through an index. */
    readonly probes?: readonly Probe[];
    /** The scalar leaves bodies read of rows lookups through indexes gave: lookup, `read` index and path. */
    readonly rowLeaves?: readonly (readonly [number, number, Path])[];
    /** Whether it reads `up`, and the scalar leaves of the parent's components it reads. */
    readonly up?: boolean;
    readonly upColumns?: readonly Column[];
    /** Whether it runs a list of rows in an index's order, as `up`'s rows run, without parents. */
    readonly ordered?: boolean;
    readonly keys: readonly Key[];
    /** The components of each list the kernel spawns, as indexes into `keys`, in the order its spawner takes values. */
    readonly spawns: readonly (readonly number[])[];
    /** Indexes into `keys` of the components a command or spawn gives a tuple or struct, which needs a linear layout. */
    readonly structuredValues: readonly number[];
    /** A module exporting `create`, importable from the main thread and from workers. */
    readonly url: string;
    /** The same body for WASM, or `null` when it uses what WASM kernels don't support: commands, or non-scalar values. */
    readonly program: Program | null;
    /** The leaves of resources the kernel reduces into, one partial each, with their operators. */
    readonly reductions: readonly Reduced[];
    /** The leaves of each value contributed whole, by resource. Registration checks they are all of the schema's leaves. */
    readonly reducedShapes: readonly Shape[];
};

/** What a kernel module at `KernelDescription.url` exports. */
export type KernelModule = {
    /**
     * Called once per registration. Per column `k`: `booleans[k]` is true when it stores booleans as 0 or 1, so reads convert them;
     * a row's element is at `row * strides[k] + offsets[k]`, in elements of the column's array.
     */
    readonly create: (booleans: readonly boolean[], strides: readonly number[], offsets: readonly number[], upBooleans?: readonly boolean[], upStrides?: readonly number[], upOffsets?: readonly number[]) => Kernel;
};
