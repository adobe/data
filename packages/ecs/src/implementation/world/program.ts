import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import type { Key } from './state.js';

/**
 * The components a world must have met before the item can match anything there: all of them, or for a changes
 * finalizer any one it watches. Empty when it can match from the start.
 */
export const triggersOf = (item: Rule | Finalizer): { readonly keys: readonly Key[]; readonly any: boolean } => {
    if (item.kind === "rule") return { keys: item.declaration.components.has ?? [], any: false };
    if (item.kind === "finalizer") return { keys: [...item.declaration.components.read ?? [], ...item.declaration.components.has ?? []], any: false };
    return { keys: item.declaration.watch ?? [], any: true };
};
