// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The checks loop protection puts in a run's compiled code (`compile/protect.ts`). Each counts its calls, and every so
 * often reads the time: the first read in a task marks when it started, and a task that runs past `budget` throws, so a
 * loop or recursion that never ends stops its run instead of freezing the page. A task ends when the event loop takes
 * the next, which a message posted at its first read marks.
 */

/** How long a task may run before it's stopped, in milliseconds. */
export const budget = 1000;
/** How many checks pass between reads of the time, a power of two. */
const every = 1024;

export const createGuard = (now: () => number = () => performance.now(), nextTask: (callback: () => void) => void = callback => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        channel.port1.close();
        callback();
    };
    channel.port2.postMessage(null);
}) => {
    let checks = 0;
    let started: number | null = null;
    const check = (what: string): void => {
        if ((++checks & (every - 1)) !== 0) return;
        const time = now();
        if (started === null) {
            started = time;
            nextTask(() => { started = null; });
            return;
        }
        if (time - started > budget) throw new RangeError(`${what} ran for over ${budget / 1000} s; the run stopped`);
    };
    return {
        loopGuard: (): void => check("This loop"),
        callGuard: (): void => check("These calls"),
    };
};

export const { loopGuard, callGuard } = createGuard();
