/**
 * Calls `call` for each maximal range of rows in `start` to `end` that passes the change filter:
 * any `added` or `changed` tick newer than `lastRun`. With no filter columns every row passes.
 */
export const forEachPassingRange = (
    added: readonly Float64Array[], changed: readonly Float64Array[], lastRun: number,
    start: number, end: number, call: (start: number, end: number) => void,
): void => {
    if (lastRun < 0 || added.length + changed.length === 0) return call(start, end);
    let first = -1;
    for (let row = start; row < end; row++) {
        let passes = false;
        for (let i = 0; i < added.length && !passes; i++) passes = added[i][row] > lastRun;
        for (let i = 0; i < changed.length && !passes; i++) passes = changed[i][row] > lastRun;
        if (passes) {
            if (first < 0) first = row;
        }
        else if (first >= 0) {
            call(first, row);
            first = -1;
        }
    }
    if (first >= 0) call(first, end);
};
