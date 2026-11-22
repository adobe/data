// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { History } from "./type.history.js";
import type { Snapshot } from "./type.snapshot.js";

/**
 * The history after a step through it, back for undo or forward for redo: the latest step the way it goes taken, the
 * state it leaves recorded as a step the other way, and the state it returns to, passed to `restore`, remembered as the
 * last recorded, so the restoring isn't recorded as a change. Null where there's no step that way.
 */
export const travel = (history: History | null, back: boolean, restore: (snapshot: Snapshot) => void): History | null => {
    if (history === null) return null;
    const from = back ? history.undo : history.redo;
    const to = back ? history.redo : history.undo;
    const step = from.at(-1);
    if (step === undefined) return null;
    const left = from.slice(0, -1);
    const gained = [...to, { snapshot: history.last, selectionOnly: step.selectionOnly }];
    restore(step.snapshot);
    return { undo: back ? left : gained, redo: back ? gained : left, last: step.snapshot };
};
