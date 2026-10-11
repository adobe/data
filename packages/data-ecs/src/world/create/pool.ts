import type { FromWorker, ToWorker, WorkerCommand, WorkerError } from './protocol.js';

type Task = Extract<ToWorker, { task: number }>;
type Request = Task extends infer T ? T extends Task ? Omit<T, "task"> : never : never;

/** A task's commands, plus its error if it failed partway; commands issued before the error still apply. */
export type TaskResult = { readonly commands: readonly WorkerCommand[]; readonly error?: Error };

/** Workers sharing the world's memory. Messages to one worker are handled in the order they're posted. */
export type Pool = {
    readonly size: number;
    readonly broadcast: (message: Exclude<ToWorker, { task: number }>) => void;
    /** Posts a task to one worker. Never rejects: a failed task or a dead worker resolves with an error. */
    readonly request: (worker: number, message: Request) => Promise<TaskResult>;
    readonly terminate: () => void;
};

/** Leaves one hardware thread for the main thread. Workers need shared memory, so none without it. */
export const defaultWorkerCount = (shared: boolean): number =>
    shared && typeof Worker === "function" ? Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1) : 0;

const errorOf = ({ name, message, stack }: WorkerError): Error => Object.assign(new Error(message), { name, stack });

type Slot = {
    readonly worker: Worker;
    readonly pending: Map<number, (result: TaskResult) => void>;
    /** Set once the worker fails to load or crashes; it gets no more tasks. */
    dead: Error | null;
};

export const createPool = (size: number, memory: WebAssembly.Memory): Pool => {
    let nextTask = 0;
    const kill = (slot: Slot, error: Error): void => {
        slot.dead ??= error;
        for (const settle of slot.pending.values()) settle({ commands: [], error: slot.dead });
        slot.pending.clear();
    };
    const slots: Slot[] = Array.from({ length: size }, () => {
        const slot: Slot = { worker: new Worker(new URL("./worker.js", import.meta.url), { type: "module" }), pending: new Map(), dead: null };
        slot.worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data;
            const settle = slot.pending.get(message.task);
            slot.pending.delete(message.task);
            settle?.(message.kind === "done" ? { commands: message.commands } : { commands: message.commands, error: errorOf(message.error) });
        };
        slot.worker.onerror = event => kill(slot, new Error(`A world worker failed: ${event.message || "it couldn't load"}.`));
        slot.worker.onmessageerror = () => kill(slot, new Error("A world worker received a message it couldn't read."));
        slot.worker.postMessage({ kind: "memory", memory } satisfies ToWorker);
        return slot;
    });
    return {
        size,
        broadcast: message => {
            for (const slot of slots) if (slot.dead === null) slot.worker.postMessage(message);
        },
        request: (worker, message) => new Promise(settle => {
            const slot = slots[worker];
            if (slot.dead !== null) return settle({ commands: [], error: slot.dead });
            const task = nextTask++;
            slot.pending.set(task, settle);
            slot.worker.postMessage({ ...message, task });
        }),
        terminate: () => {
            for (const slot of slots) {
                slot.worker.terminate();
                kill(slot, new Error("The world is disposed."));
            }
        },
    };
};
