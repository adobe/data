// © 2026 Adobe. MIT License. See /LICENSE for details.
import { done, epoch, posted, ringSize, signal, taskWords } from './protocol.js';

/**
 * A pool worker's window (`pool.ts`): runs the tasks of its ring, each by `runTask` with its payload's base, which
 * throws when the task fails, blocking between them, until the pool closes the window or posts a task of a later one;
 * then it returns, so the worker handles its messages. `control`, `statuses` and `payloads` are the worker's views of
 * the pool's state; `windowEpoch` is the epoch the window opened in.
 */
export const runWindow = (control: Int32Array, statuses: Int32Array, payloads: Float64Array, windowEpoch: number, runTask: (base: number) => void): void => {
    let next = Atomics.load(control, done);
    for (;;) {
        const seen = Atomics.load(control, signal);
        if (next < Atomics.load(control, posted)) {
            const ring = next % ringSize;
            const base = ring * taskWords;
            // A task from a later window waits until this worker has handled the messages sent before it.
            if (payloads[base + 6] !== windowEpoch) return;
            let status = next + 1;
            try {
                runTask(base);
            }
            catch {
                status = -status;
            }
            Atomics.store(statuses, ring, status);
            next++;
            Atomics.store(control, done, next);
            Atomics.notify(control, done);
            continue;
        }
        // Closed, it leaves once it ran this window's tasks: the pool posts a task before it closes the window, so a task
        // posted since the check above is seen now, and runs above if it's this window's.
        if (Atomics.load(control, epoch) !== windowEpoch) {
            if (next < Atomics.load(control, posted)) continue;
            return;
        }
        // Tiers follow each other closely, so spin briefly before paying for a blocking wait's wake-up.
        const deadline = performance.now() + 0.05;
        while (Atomics.load(control, signal) === seen && performance.now() < deadline);
        if (Atomics.load(control, signal) === seen) Atomics.wait(control, signal, seen);
    }
};
