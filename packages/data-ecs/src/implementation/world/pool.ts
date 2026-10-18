import { allocateArray, freeArray } from './arrays.js';
import { emptyBuffer, type CommandBuffer } from './buffer.js';
import type { Memory } from './memory.js';
import { maximumPieces, startRanges } from './claims.js';
import { controlWords, splitCount, done, epoch, lineWords, posted, ringSize, signal, taskFields, taskWords, type FromWorker, type PostedSpawns, type ToWorker, type WorkerError } from './protocol.js';

type Task = Extract<ToWorker, { task: number }>;
type Request = Task extends infer T ? T extends Task ? Omit<T, "task"> : never : never;

/** A task's commands and staged spawns, plus its error if it failed partway; what it issued before the error still applies. */
export type TaskResult = { readonly commands: CommandBuffer; readonly spawns?: readonly PostedSpawns[]; readonly unused?: readonly number[]; readonly error?: Error };

/** A WASM kernel task: everything is a number, so it travels through shared memory instead of a message. */
export type FastTask = {
    readonly kernel: number;
    readonly archetype: number;
    readonly start: number;
    readonly end: number;
    readonly tick: number;
    readonly lastRun: number;
    readonly scalars: readonly number[];
    /**
     * The byte address of the task's first reduction partials, or -1 without reductions; they follow the scalars, and
     * count against `maximumScalars`. A worker running claimed pieces folds piece `p` into the partials `p * partialBytes` past it.
     */
    readonly partials: number;
    readonly partialBytes: number;
};

/**
 * Workers sharing the world's memory. Messages to one worker are handled in the order they're posted.
 * `claimed` tasks go through a ring in shared memory while workers wait on it in a window, which costs one message to
 * open; a message, a broadcast or `close` ends the window, after the tasks already posted.
 */
export type Pool = {
    readonly size: number;
    readonly broadcast: (message: Exclude<ToWorker, { task: number }>) => void;
    /** Posts a task to one worker. Never rejects: a failed task or a dead worker resolves with an error. */
    readonly request: (worker: number, message: Request) => Promise<TaskResult>;
    /**
     * Posts one task to each of `workers` workers from `first`, which claim `grain`-row pieces of the task's range:
     * each from its own home range first, then from others' (`claims.ts`), so faster workers take more and a worker
     * mapped to the same range each tier finds its rows in cache. With no room for claims, splits the range evenly.
     */
    readonly claimed: (first: number, workers: number, task: FastTask, grain: number) => Promise<TaskResult>[];
    readonly close: () => void;
    /**
     * Stops the workers, then releases the pool's control state to the arena once every worker that waited on it has
     * left its window, as each acknowledges a message. One that doesn't within `releaseTimeout`, or that died with a
     * window open, may still touch it, so it's kept.
     */
    readonly terminate: () => Promise<void>;
};

/** How long `terminate` waits for workers to leave their windows before keeping the control state. */
const releaseTimeout = 1000;



/** The platform's pool size, where workers can share memory: one worker per hardware thread but the world's. */
export const platformWorkerCount = (): number => Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1);

const errorOf = ({ name, message, stack }: WorkerError): Error => Object.assign(new Error(message), { name, stack });

type Slot = {
    readonly worker: Worker;
    readonly pending: Map<number, (result: TaskResult) => void>;
    /** Set once the worker fails to load or crashes; it gets no more tasks. */
    dead: Error | null;
};

type Block = { readonly offset: number; readonly bytes: number };

/** Zeroed Int32 words starting on a cache line, so a block of whole lines shares none with other arrays; `blocks` records the block. */
const allocateLines = (arena: Memory, words: number, blocks: Block[]): Int32Array => {
    const lineBytes = lineWords * 4;
    const bytes = words * 4 + lineBytes;
    const offset = arena.allocate(bytes);
    blocks.push({ offset, bytes });
    return new Int32Array(arena.memory.buffer, Math.ceil(offset / lineBytes) * lineBytes, words).fill(0);
};

export const createPool = (size: number, arena: Memory): Pool => {
    const { memory } = arena;
    let nextTask = 0;
    const lines: Block[] = [];
    const control = allocateLines(arena, size * controlWords, lines);
    const statuses = allocateLines(arena, size * ringSize, lines);
    const payloads = allocateArray(arena, Float64Array, size * ringSize * taskWords);
    const claims = allocateLines(arena, splitCount * size * lineWords, lines);
    /** Splits' claim slots no split in flight uses: one is reused only once every task of its split is done. */
    const freeSplits = Array.from({ length: splitCount }, (_, split) => split);
    const open = new Array<boolean>(size).fill(false);
    /** Whether each worker was ever given a window, and so may touch the control state. */
    const windowed = new Array<boolean>(size).fill(false);
    const sent = new Array<number>(size).fill(0);
    /** Writes held back by a full ring, chained so they stay in order. */
    const waiting = new Array<number>(size).fill(0);
    const chains = Array.from({ length: size }, (): Promise<void> => Promise.resolve());
    const kill = (slot: Slot, error: Error): void => {
        slot.dead ??= error;
        for (const settle of slot.pending.values()) settle({ commands: emptyBuffer, error: slot.dead });
        slot.pending.clear();
    };
    const slots: Slot[] = Array.from({ length: size }, () => {
        const slot: Slot = { worker: new Worker(new URL("./worker.js", import.meta.url), { type: "module" }), pending: new Map(), dead: null };
        slot.worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data;
            const settle = slot.pending.get(message.task);
            slot.pending.delete(message.task);
            settle?.(message.kind === "done" ? { commands: message.commands, spawns: message.spawns, unused: message.unused } : { commands: message.commands, spawns: message.spawns, unused: message.unused, error: errorOf(message.error) });
        };
        slot.worker.onerror = event => kill(slot, new Error(`A world worker failed: ${event.message || "it couldn't load"}.`));
        slot.worker.onmessageerror = () => kill(slot, new Error("A world worker received a message it couldn't read."));
        slot.worker.postMessage({ kind: "memory", memory } satisfies ToWorker);
        return slot;
    });
    const wake = (worker: number): void => {
        Atomics.add(control, worker * controlWords + signal, 1);
        Atomics.notify(control, worker * controlWords + signal);
    };

    const close = (): void => {
        for (let worker = 0; worker < size; worker++) {
            if (!open[worker]) continue;
            open[worker] = false;
            Atomics.add(control, worker * controlWords + epoch, 1);
            wake(worker);
        }
    };

    /** Opens a worker's window for the current epoch, after any messages already posted to it. */
    const ensureOpen = (worker: number): void => {
        if (open[worker]) return;
        open[worker] = true;
        windowed[worker] = true;
        const current = Atomics.load(control, worker * controlWords + epoch);
        slots[worker].worker.postMessage({ kind: "window", control: control.byteOffset, statuses: statuses.byteOffset, payloads: payloads.byteOffset, claims: claims.byteOffset, worker, epoch: current } satisfies ToWorker);
    };

    /** One brief spin for all waiters of a batch of tasks, which are short, before waiting without blocking. */
    let spinUntil = 0;
    /** Resolves once the worker has done `count` tasks. */
    const whenDone = async (worker: number, count: number): Promise<void> => {
        const index = worker * controlWords + done;
        while (Atomics.load(control, index) < count) {
            if (slots[worker].dead !== null) return;
            if (performance.now() < spinUntil) continue;
            const current = Atomics.load(control, index);
            if (current >= count) return;
            const waited = Atomics.waitAsync(control, index, current, 50);
            if (waited.async) await waited.value;
        }
    };

    const post = (worker: number, task: FastTask, line: number, grain: number, self: number, participants: number): Promise<TaskResult> => {
        const slot = slots[worker];
        if (slot.dead !== null) return Promise.resolve({ commands: emptyBuffer, error: slot.dead });
        const count = ++sent[worker];
        const ring = (count - 1) % ringSize;
        spinUntil = performance.now() + 2;
        const write = (): void => {
            // A write held back past a close reopens the window, behind the messages posted since.
            ensureOpen(worker);
            const current = Atomics.load(control, worker * controlWords + epoch);
            const base = (worker * ringSize + ring) * taskWords;
            payloads.set([task.kernel, task.archetype, task.start, task.end, task.tick, task.lastRun, current, task.scalars.length, line, grain, self, participants], base);
            payloads.set(task.partials < 0 ? task.scalars : [...task.scalars, task.partials, task.partialBytes], base + taskFields);
            Atomics.store(control, worker * controlWords + posted, count);
            wake(worker);
        };
        // Written now when there's room, so the worker starts at once; otherwise in order, once the worker frees a slot.
        let written: Promise<void>;
        if (waiting[worker] === 0 && count - Atomics.load(control, worker * controlWords + done) <= ringSize) {
            write();
            written = Promise.resolve();
        }
        else {
            waiting[worker]++;
            written = chains[worker] = chains[worker].then(async () => {
                await whenDone(worker, count - ringSize);
                write();
                waiting[worker]--;
            });
        }
        return (async (): Promise<TaskResult> => {
            await written;
            await whenDone(worker, count);
            if (slot.dead !== null) return { commands: emptyBuffer, error: slot.dead };
            // The worker records each task's number, negated if it failed, so a reused slot can't hide a failure.
            const failed = Atomics.load(statuses, worker * ringSize + ring) === -count;
            return failed ? { commands: emptyBuffer, error: new Error("A world worker's kernel failed.") } : { commands: emptyBuffer };
        })();
    };

    const claimed = (first: number, workers: number, task: FastTask, grain: number): Promise<TaskResult>[] => {
        const pieces = Math.ceil((task.end - task.start) / grain);
        const split = pieces <= maximumPieces ? freeSplits.pop() : undefined;
        if (split === undefined) {
            const share = Math.ceil((task.end - task.start) / workers / grain) * grain;
            // Each share runs as the grain-row pieces it holds, into those pieces' partials, as claims would.
            return Array.from({ length: workers }, (_, i) =>
                post((first + i) % size, {
                    ...task, start: task.start + i * share, end: Math.min(task.end, task.start + (i + 1) * share),
                    partials: task.partials < 0 ? -1 : task.partials + (i * share / grain) * task.partialBytes,
                }, -1, grain, 0, 0));
        }
        const line = split * size;
        startRanges(claims.subarray(line * lineWords, (line + workers) * lineWords), workers, pieces);
        const results = Array.from({ length: workers }, (_, i) => post((first + i) % size, task, line, grain, i, workers));
        void Promise.all(results).then(() => freeSplits.push(split));
        return results;
    };

    return {
        size,
        claimed,
        broadcast: message => {
            close();
            for (const slot of slots) if (slot.dead === null) slot.worker.postMessage(message);
        },
        close,
        request: (worker, message) => new Promise(settle => {
            close();
            const slot = slots[worker];
            if (slot.dead !== null) return settle({ commands: emptyBuffer, error: slot.dead });
            const task = nextTask++;
            slot.pending.set(task, settle);
            slot.worker.postMessage({ ...message, task });
        }),
        terminate: async () => {
            close();
            // A worker handles messages only outside its window, so its reply means it has left and won't enter again.
            const left = slots.map((slot, worker) => !windowed[worker] ? Promise.resolve(true)
                : slot.dead !== null ? Promise.resolve(false)
                : new Promise<boolean>(settle => {
                    const task = nextTask++;
                    slot.pending.set(task, result => settle(result.error === undefined));
                    slot.worker.postMessage({ kind: "kernels", kernels: [], task } satisfies ToWorker);
                }));
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<boolean>(settle => { timer = setTimeout(() => settle(false), releaseTimeout); });
            const released = await Promise.race([Promise.all(left).then(all => all.every(Boolean)), timeout]);
            clearTimeout(timer);
            for (const slot of slots) {
                slot.worker.terminate();
                kill(slot, new Error("The world is disposed."));
            }
            if (!released) return;
            for (const { offset, bytes } of lines) arena.free(offset, bytes);
            freeArray(arena, payloads);
        },
    };
};
