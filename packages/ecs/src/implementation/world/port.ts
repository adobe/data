// © 2026 Adobe. MIT License. See /LICENSE for details.
/** One end of a channel between threads: messages each way, in the order they were posted. */
export type Channel<Send, Receive> = {
    /** Posts a message, moving the buffers in `transfer`. */
    readonly post: (message: Send, transfer?: ArrayBuffer[]) => void;
    /** Sets the one handler for messages. */
    readonly onMessage: (handler: (message: Receive) => void) => void;
};

/**
 * A thread as another sees it: over a browser `Worker`, a node `worker_threads` worker, or a `MessagePort` another
 * thread lent, whose owner reports its death and ends it.
 */
export type Port<Send, Receive> = Channel<Send, Receive> & {
    /** Sets the one handler for the thread's death: a load failure, a crash or an exit. It's called at most once. */
    readonly onDeath: (handler: (error: Error) => void) => void;
    /** Ends the thread; resolves once it's gone, or once its owner has ended it. */
    readonly terminate: () => Promise<void>;
};

/**
 * A `MessagePort` of either platform, as both use it. A message's data is what the other end posted, typed by the
 * channel it crosses, as the platforms' own `MessageEvent` types leave it.
 */
export type Endpoint = {
    readonly postMessage: (message: unknown, transfer: ArrayBuffer[]) => void;
    readonly addEventListener: (type: "message" | "close", listener: (event: { readonly data?: any }) => void) => void;
    readonly start: () => void;
    readonly close: () => void;
};

/**
 * A worker another thread owns, lent to this one: `port` reaches the worker, and `owner` its owner, which reports the
 * worker's death on it and ends the worker when asked. `P` is the platform's `MessagePort`, which transfers.
 */
export type Lent<P extends Endpoint = Endpoint> = { readonly port: P; readonly owner: P };

/** Between a lent worker's owner and the thread it's lent to. */
type ToOwner = { readonly kind: "terminate" };
type FromOwner = { readonly kind: "death"; readonly message: string } | { readonly kind: "terminated" };

/** A death to report once: the first error wins, and a handler set after it still hears it. */
export const createDeath = (): { readonly die: (error: Error) => void; readonly onDeath: (handler: (error: Error) => void) => void } => {
    let error: Error | null = null;
    let handler: ((error: Error) => void) | null = null;
    return {
        die: reason => {
            if (error !== null) return;
            error = reason;
            handler?.(reason);
        },
        onDeath: next => {
            handler = next;
            if (error !== null) next(error);
        },
    };
};

const noTransfer: ArrayBuffer[] = [];

/** A `MessagePort` as a channel. */
export const endpointChannel = <Send, Receive>(endpoint: Endpoint): Channel<Send, Receive> => ({
    post: (message, transfer = noTransfer) => endpoint.postMessage(message, transfer),
    onMessage: handler => {
        endpoint.addEventListener("message", event => handler(event.data));
        endpoint.start();
    },
});

/**
 * A worker's own scope as a channel: node's `parentPort`, or a browser worker's `self`.
 */
export const scopeChannel = <Send, Receive>(): Channel<Send, Receive> => {
    const parent = globalThis.process?.getBuiltinModule?.("node:worker_threads")?.parentPort ?? null;
    if (parent !== null) return endpointChannel(parent);
    return {
        post: (message, transfer) => self.postMessage(message, { transfer }),
        onMessage: handler => { self.onmessage = (event: MessageEvent<Receive>) => handler(event.data); },
    };
};

/**
 * The thread a lent worker runs on, as the thread it's lent to sees it: its death is what its owner reports, or either
 * port's `close` where the platform has it; `terminate` asks the owner, and closes both ports once it has, or once the
 * owner's port closed.
 */
export const lentPort = <Send, Receive>({ port, owner }: Lent): Port<Send, Receive> => {
    const channel = endpointChannel<Send, Receive>(port);
    const death = createDeath();
    const control = endpointChannel<ToOwner, FromOwner>(owner);
    let terminated: (() => void) | null = null;
    control.onMessage(message => {
        if (message.kind === "death") death.die(new Error(message.message));
        else terminated?.();
    });
    port.addEventListener("close", () => death.die(new Error("A world worker's port closed.")));
    // An owner whose thread is gone can't answer; where the platform reports that, its worker is gone with it.
    owner.addEventListener("close", () => {
        death.die(new Error("A world worker's owner is gone."));
        terminated?.();
    });
    return {
        ...channel,
        onDeath: death.onDeath,
        terminate: () => new Promise<void>(resolve => {
            terminated = () => {
                terminated = null;
                port.close();
                owner.close();
                resolve();
            };
            control.post({ kind: "terminate" });
        }),
    };
};

/**
 * On the owner's thread: serves a lent worker's owner end, forwarding the worker's death and ending it when the
 * thread it's lent to asks, or when `terminate` is called here, which reports it as a death there.
 */
export const serveLent = (worker: Pick<Port<unknown, unknown>, "onDeath" | "terminate">, owner: Endpoint): { readonly terminate: () => Promise<void> } => {
    const control = endpointChannel<FromOwner, ToOwner>(owner);
    let gone = false;
    worker.onDeath(error => {
        if (gone) return;
        gone = true;
        control.post({ kind: "death", message: error.message });
    });
    const end = async (): Promise<void> => {
        await worker.terminate();
        if (gone) return;
        gone = true;
        control.post({ kind: "death", message: "A world worker was terminated by its owner." });
    };
    control.onMessage(async () => {
        gone = true;
        await worker.terminate();
        control.post({ kind: "terminated" });
        owner.close();
    });
    return { terminate: end };
};
