// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Node } from 'estree';
import type { Expression } from './ir.js';
import type { Link } from './link.js';
import type { Lists } from './lists.js';
import type { Module } from './module-scope.js';
import type { Out } from './out.js';
import type { Scope } from './scope.js';
import type { Signature } from './signature.js';
import type { Value } from './value.js';

export type ExpressionCompiler = (node: Node, scope: Scope, out: Out) => Value;
export type StatementCompiler = (node: Node, scope: Scope, out: Out) => void;

/**
 * State for compiling one kernel. Compilers are injected so expression, call and statement modules
 * don't import each other.
 */
export type Unit = {
    readonly signature: Signature;
    /** The module being transformed. */
    readonly module: Module;
    /** The kernel's lists of keys, wherever they are declared. */
    readonly lists: Lists;
    /** Other modules, for functions and constants the kernel imports. */
    readonly link: Link | null;
    /** GPU kernels emit intrinsic regions for calls to functions that match WGSL builtins. */
    readonly target: "cpu" | "gpu";
    /** Whether the body is only tried, unflagged: then module data, which may change, isn't inlined. */
    readonly tried: boolean;
    /** Column descriptions as source text, in `columns` order, indexed by an identity key. */
    readonly columns: string[];
    readonly columnIndex: Map<string, number>;
    /** Chunk columns: dense, indexed by `i >> chunkShift` rather than a strided row index. */
    readonly chunks: Set<number>;
    /** Block columns: dense, indexed by `i >> blockShift`. */
    readonly blocks: Set<number>;
    /**
     * Chunk columns stamped once per call before the row loop, with their block columns, so their per-row stamps are
     * dropped.
     */
    readonly stampedPerCall: Map<number, number>;
    /** Columns read where a boolean's identity is observable, so they need conversion. */
    readonly booleans: Set<number>;
    /** Every value assigned to each local, to propagate observation. */
    readonly assignments: Map<number, Expression[]>;
    /** Locals whose value reaches an observable position. */
    readonly observed: Set<number>;
    /** Source names of locals, for readable JS. */
    readonly names: Map<number, string>;
    /** Shape descriptions as source text. */
    readonly shapes: Set<string>;
    /** The shapes of values contributed to reductions, as source text. */
    readonly reducedShapes: Set<string>;
    readonly keys: string[];
    /** The components a command or spawn gives a tuple or struct, by name. */
    readonly structuredValues: Set<string>;
    /** Each list the kernel spawns, as indexes into `keys`, listed once. */
    readonly spawns: (readonly number[])[];
    /** Each leaf a reduction folds into: its resource (an index into `Signature.reduced`), path and accumulator local. */
    readonly accumulators: { readonly reduced: number; readonly path: readonly (number | string)[]; readonly local: number }[];
    /** The components, resources and lookup results the body reads and writes, to check the declaration lists only those. */
    readonly used: { readonly read: Set<string>; readonly write: Set<string>; readonly resources: Set<string>; readonly lookups: Map<string, Set<string>>; readonly up: Set<string> };
    /** The local holding `up`, set once per call: non-null when the rows of the call have a parent. */
    readonly up: number | null;
    /** Columns of the parent's components that `up` reads, as source text, indexed by an identity key. */
    readonly upColumns: string[];
    readonly upColumnIndex: Map<string, number>;
    /** Parent columns read where a boolean's identity is observable. */
    readonly upBooleans: Set<number>;
    /** Each call site of a lookup through an index, as `KernelDescription.probes` lists it, as source text. */
    readonly probes: string[];
    /** The row leaves bodies read, as `KernelDescription.rowLeaves` lists them, by `JSON.stringify` of each. */
    readonly rowLeaves: string[];
    /** Locals holding lists and rows of lookups through indexes, which are handles each kernel instance makes once. */
    readonly handles: Set<number>;
    /** Helpers and constants being inlined, to reject recursion. */
    readonly active: Set<string>;
    readonly next: () => number;
    readonly expression: ExpressionCompiler;
    readonly statement: StatementCompiler;
};

export const createUnit = (signature: Signature, module: Module, lists: Lists, expression: ExpressionCompiler, statement: StatementCompiler, link: Link | null = null, target: "cpu" | "gpu" = "cpu", tried = false): Unit => {
    let counter = 0;
    const names = new Map<number, string>();
    const up = signature.up === null ? null : counter++;
    if (up !== null) names.set(up, "up");
    return {
        signature, module, lists, link, target, tried, columns: [], columnIndex: new Map(), chunks: new Set(), blocks: new Set(), stampedPerCall: new Map(), booleans: new Set(), assignments: new Map(), observed: new Set(), names, shapes: new Set(), reducedShapes: new Set(), keys: [], structuredValues: new Set(), spawns: [], accumulators: [], active: new Set(),
        used: { read: new Set(), write: new Set(), resources: new Set(), lookups: new Map(), up: new Set() },
        up, upColumns: [], upColumnIndex: new Map(), upBooleans: new Set(), probes: [], rowLeaves: [], handles: new Set(),
        next: () => counter++, expression, statement,
    };
};

/** A fresh local, printed as `hint_n` so it never collides with fixed generated names. */
export const fresh = (unit: Unit, hint: string): number => {
    const local = unit.next();
    unit.names.set(local, hint);
    return local;
};

/** A fresh block or loop label. */
export const label = (unit: Unit): number => unit.next();

/** The `keys` index for a component named in a command. */
export const keyIndex = (unit: Unit, name: string): number => {
    const index = unit.keys.indexOf(name);
    if (index >= 0) return index;
    unit.keys.push(name);
    return unit.keys.length - 1;
};

/** The `spawns` index for a list of components a kernel spawns. */
export const spawnIndex = (unit: Unit, names: readonly string[]): number => {
    const keys = names.map(name => keyIndex(unit, name));
    const index = unit.spawns.findIndex(list => list.length === keys.length && list.every((key, k) => key === keys[k]));
    if (index >= 0) return index;
    unit.spawns.push(keys);
    return unit.spawns.length - 1;
};
