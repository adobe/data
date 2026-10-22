import { indexOf } from './entities.js';

/**
 * The holders of each target for one reference component, as linked lists by entity index: holder index `h` is in
 * the list of `indexOf(targets[h])`, after `next[h] - 1` and before `previous[h] - 1` (0 for none), and holds
 * `targets[h]`, generation included, so a list never mixes a target's generations.
 */
export type Holders = { first: Int32Array; next: Int32Array; previous: Int32Array; targets: Float64Array; holders: Float64Array };

export const createHolders = (): Holders => ({ first: new Int32Array(0), next: new Int32Array(0), previous: new Int32Array(0), targets: new Float64Array(0), holders: new Float64Array(0) });

const grownInt = (array: Int32Array, length: number): Int32Array => {
    if (array.length >= length) return array;
    const grown = new Int32Array(Math.max(length, 2 * array.length));
    grown.set(array);
    return grown;
};

const grownFloat = (array: Float64Array, length: number): Float64Array => {
    if (array.length >= length) return array;
    const grown = new Float64Array(Math.max(length, 2 * array.length));
    grown.set(array);
    return grown;
};

/** Grows the lists to cover entity indexes below `length`. */
export const fitHolders = (lists: Holders, length: number): void => {
    if (lists.first.length >= length) return;
    lists.first = grownInt(lists.first, length);
    lists.next = grownInt(lists.next, length);
    lists.previous = grownInt(lists.previous, length);
    lists.targets = grownFloat(lists.targets, length);
    lists.holders = grownFloat(lists.holders, length);
};

/** Adds `holder` to the list of `target`. Each holder is in at most one list, so it must be unlinked first. */
export const linkHolder = (lists: Holders, target: number, holder: number): void => {
    const at = indexOf(holder);
    const into = indexOf(target);
    const first = lists.first[into];
    lists.next[at] = first;
    lists.previous[at] = 0;
    if (first !== 0) lists.previous[first - 1] = at + 1;
    lists.first[into] = at + 1;
    lists.targets[at] = target;
    lists.holders[at] = holder;
};

/** Removes `holder` from the list of `target`, if it's there. */
export const unlinkHolder = (lists: Holders, target: number, holder: number): void => {
    const at = indexOf(holder);
    if (at >= lists.first.length || lists.targets[at] !== target || lists.holders[at] !== holder) return;
    const previous = lists.previous[at];
    const next = lists.next[at];
    if (previous !== 0) lists.next[previous - 1] = next;
    else lists.first[indexOf(target)] = next;
    if (next !== 0) lists.previous[next - 1] = previous;
    lists.targets[at] = 0;
};

/** Calls `each` with every holder of `target`. */
export const forEachHolder = (lists: Holders, target: number, each: (holder: number) => void): void => {
    const into = indexOf(target);
    if (into >= lists.first.length) return;
    for (let at = lists.first[into]; at !== 0; at = lists.next[at - 1]) {
        if (lists.targets[at - 1] === target) each(lists.holders[at - 1]);
    }
};
