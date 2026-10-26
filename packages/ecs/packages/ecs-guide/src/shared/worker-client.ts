// © 2026 Adobe. MIT License. See /LICENSE for details.
import { isUnavailable } from "../workers/serve.js";

/** What a worker client tells its owner: replies, and the worker failing, being started again, and given up on. */
export type WorkerEvents = {
    readonly message: (data: unknown) => void;
    /** The worker failed, and starts again after a moment, for the `attempt`th time. */
    readonly retrying: (reason: string, attempt: number) => void;
    /** A worker started again, which has none of the messages posted to the last: post again those still waiting. */
    readonly restarted: () => void;
    /** Every start failed: answer what's waiting with `reason`. The next post starts trying again. */
    readonly failed: (reason: string) => void;
};

/** How long to wait before each start again, in milliseconds. */
export const retryDelays: readonly number[] = [500, 1000, 2000];

/**
 * A worker `create` makes, as the bundler finds it there, which messages call `name`, started when a message is first posted to it, and started again, after a short wait each time, when it
 * fails to load or fails as it runs, until `delays` run out.
 */
export const createWorkerClient = (name: string, create: () => Worker, events: WorkerEvents, delays: readonly number[] = retryDelays): { readonly post: (message: unknown) => void } => {
    let worker: Worker | null = null;
    let waiting: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const fail = (failed: Worker, reason: string): void => {
        if (failed !== worker) return;
        failed.terminate();
        worker = null;
        if (attempts >= delays.length) {
            attempts = 0;
            events.failed(reason);
            return;
        }
        const delay = delays[attempts] ?? 0;
        attempts++;
        events.retrying(reason, attempts);
        waiting = setTimeout(() => {
            waiting = null;
            start();
            events.restarted();
        }, delay);
    };
    const start = (): Worker => {
        const created = create();
        created.addEventListener("message", event => {
            if (isUnavailable(event.data)) return fail(created, event.data.reason);
            attempts = 0;
            events.message(event.data);
        });
        // An entry that fails to load fails its worker with no message; a worker that throws, with its error's.
        created.addEventListener("error", event => {
            event.preventDefault();
            const message: unknown = Reflect.get(event, "message");
            fail(created, typeof message === "string" && message !== "" ? message : `${name} didn't load`);
        });
        worker = created;
        return created;
    };
    return {
        post: message => {
            // While a start again is waiting, what's posted is posted again once it starts.
            if (waiting !== null) return;
            (worker ?? start()).postMessage(message);
        },
    };
};
