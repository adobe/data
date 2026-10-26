// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createMemory, pageBytes, pagesWord, type Memory } from "./memory.js";
import { createPool } from "./pool.js";
import { idleKernel } from "./protocol.js";
import { missingWorker, startWorkers } from "./platforms.test-helper.js";

/** Scenarios of the pool over its ports, run built in node and from source in chromium. */

/** Two tasks on a worker that couldn't load: the first's error, and whether the second failed with the same one. */
export const unloadable = async (): Promise<{ readonly message: string | undefined; readonly same: boolean }> => {
    const pool = createPool([missingWorker()], createMemory(true));
    const first = await pool.request(0, { kind: "kernels", kernels: [] });
    const second = await pool.request(0, { kind: "kernels", kernels: [] });
    await pool.terminate();
    return { message: first.error?.message, same: second.error === first.error };
};

/** Bytes the arena holds for pools of 1 to 4 workers, each with every window opened: before and after `terminate`. */
export const released = async (): Promise<readonly (readonly [number, number])[]> => {
    const arena = createMemory(true);
    /** Bytes allocated and not yet freed. */
    let held = 0;
    const counting: Memory = {
        ...arena,
        allocate: bytes => { held += bytes; return arena.allocate(bytes); },
        free: (offset, bytes) => { held -= bytes; arena.free(offset, bytes); },
    };
    const results: [number, number][] = [];
    for (let size = 1; size <= 4; size++) {
        const pool = createPool(startWorkers(size), counting);
        // Open each worker's window, so each has used the control lines being released.
        await Promise.all(pool.claimed(0, size, { kernel: idleKernel, archetype: -1, start: 0, end: 0, tick: 0, lastRun: 0, scalars: [], partials: -1, partialBytes: 0 }, 1));
        const before = held;
        await pool.terminate();
        results.push([before, held]);
    }
    return results;
};

/**
 * A worker whose memory is shorter than the length the world stored: its errors before, while and after the length
 * is past its buffer.
 */
export const shortMemory = async (): Promise<readonly (string | undefined)[]> => {
    const memory = createMemory(true);
    const pool = createPool(startWorkers(1), memory);
    const before = (await pool.request(0, { kind: "kernels", kernels: [] })).error?.message;
    const pages = memory.memory.buffer.byteLength / pageBytes;
    Atomics.store(memory.header, pagesWord, pages + 1);
    const during = (await pool.request(0, { kind: "kernels", kernels: [] })).error?.message;
    Atomics.store(memory.header, pagesWord, pages);
    const after = (await pool.request(0, { kind: "kernels", kernels: [] })).error?.message;
    await pool.terminate();
    return [before, during, after];
};
