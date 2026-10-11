import type { Node } from 'estree';
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
    /** Every code assigned to each emitted local, to propagate observation. */
    readonly assignments: Map<string, string[]>;
    /** Locals whose value reaches an observable position. */
    readonly observed: Set<string>;
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
        signature, module, columns: [], columnIndex: new Map(), booleans: new Set(), assignments: new Map(), observed: new Set(), shapes: new Set(), keys: [], active: new Set(),
        next: () => counter++, expression, statement,
    };
};

/** A fresh local name. Source names get a `_n` suffix, so they never collide with fixed generated names. */
export const fresh = (unit: Unit, hint: string): string => `${hint}_${unit.next()}`;

/** The local holding the key for a component named in a command. */
export const keyLocal = (unit: Unit, name: string): string => {
    const index = unit.keys.indexOf(name);
    if (index >= 0) return `k${index}`;
    unit.keys.push(name);
    return `k${unit.keys.length - 1}`;
};
