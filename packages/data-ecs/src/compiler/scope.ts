import type { Unit } from './unit.js';
import type { Value } from './value.js';

export type Local = { readonly value: Value; readonly mutable: boolean };

/** `label` names the block a `continue` breaks out of. */
export type Loop = { readonly label: string };

/** A lexical scope. A helper's scope has no parent, so it sees only its parameters and module scope. */
export type Scope = {
    readonly unit: Unit;
    readonly locals: Map<string, Local>;
    readonly parent: Scope | undefined;
    readonly loop: Loop | undefined;
    readonly helper: boolean;
};

export const rootScope = (unit: Unit, helper: boolean): Scope => ({ unit, locals: new Map(), parent: undefined, loop: undefined, helper });

export const childScope = (scope: Scope, loop: Loop | undefined = scope.loop): Scope =>
    ({ unit: scope.unit, locals: new Map(), parent: scope, loop, helper: scope.helper });

export const findLocal = (scope: Scope | undefined, name: string): Local | undefined =>
    scope === undefined ? undefined : scope.locals.get(name) ?? findLocal(scope.parent, name);
