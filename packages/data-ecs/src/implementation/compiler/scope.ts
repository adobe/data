import type { Module } from './module-scope.js';
import type { Unit } from './unit.js';
import type { Value } from './value.js';

export type Local = { readonly value: Value; readonly mutable: boolean };

/** The labels `break` and `continue` branch to. */
export type Loop = { readonly exit: number; readonly next: number };

/** A lexical scope. A helper's scope has no parent, so it sees only its parameters and its module's scope, `module`. */
export type Scope = {
    readonly unit: Unit;
    readonly module: Module;
    readonly locals: Map<string, Local>;
    readonly parent: Scope | undefined;
    readonly loop: Loop | undefined;
    readonly helper: boolean;
};

export const rootScope = (unit: Unit, helper: boolean, module: Module = unit.module): Scope =>
    ({ unit, module, locals: new Map(), parent: undefined, loop: undefined, helper });

export const childScope = (scope: Scope, loop: Loop | undefined = scope.loop): Scope =>
    ({ unit: scope.unit, module: scope.module, locals: new Map(), parent: scope, loop, helper: scope.helper });

export const findLocal = (scope: Scope | undefined, name: string): Local | undefined =>
    scope === undefined ? undefined : scope.locals.get(name) ?? findLocal(scope.parent, name);
