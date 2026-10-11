import type { Node } from 'estree';
import type { Expression } from './ir.js';
import type { ModuleScope } from './module-scope.js';
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
    readonly module: ModuleScope;
    /** Column descriptions as source text, in `columns` order, indexed by an identity key. */
    readonly columns: string[];
    readonly columnIndex: Map<string, number>;
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
    readonly keys: string[];
    /** Helpers and constants being inlined, to reject recursion. */
    readonly active: Set<string>;
    readonly next: () => number;
    readonly expression: ExpressionCompiler;
    readonly statement: StatementCompiler;
};

export const createUnit = (signature: Signature, module: ModuleScope, expression: ExpressionCompiler, statement: StatementCompiler): Unit => {
    let counter = 0;
    return {
        signature, module, columns: [], columnIndex: new Map(), booleans: new Set(), assignments: new Map(), observed: new Set(), names: new Map(), shapes: new Set(), keys: [], active: new Set(),
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
