// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SyncSystem } from '../../interface/system/sync-system.js';
import type { Derivation } from '../../interface/component/derivation.js';
import type { Key } from './state.js';

/**
 * The components a world must have met before the item can match anything there: all of them, or for a changes
 * sync system any one it watches. Empty when it can match from the start.
 */
export const triggersOf = (item: Derivation | SyncSystem): { readonly keys: readonly Key[]; readonly any: boolean } => {
    if (item.kind === "derivation") return { keys: item.declaration.components.has ?? [], any: false };
    if (item.kind === "removed") return { keys: [...item.declaration.components.read ?? [], ...item.declaration.components.has ?? []], any: false };
    const { watch } = item.declaration;
    // Every component, or those declaring a trait, may be met at any sync point.
    if (watch.components === true || watch.componentTraits.length + watch.resourceTraits.length > 0) return { keys: [], any: true };
    return { keys: [...watch.components, ...watch.resources], any: true };
};
