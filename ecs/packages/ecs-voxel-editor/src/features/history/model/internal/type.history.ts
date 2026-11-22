// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Snapshot } from "./type.snapshot.js";

/**
 * The edit history: the steps undo and redo go back and forward through, each the state to return to and whether only
 * the selection differs from it, most recent last; and the state last recorded. It's replaced as it changes, so
 * systems can filter on the resource holding it.
 */
export type History = {
    readonly undo: readonly Step[];
    readonly redo: readonly Step[];
    readonly last: Snapshot;
};

type Step = { readonly snapshot: Snapshot; readonly selectionOnly: boolean };
