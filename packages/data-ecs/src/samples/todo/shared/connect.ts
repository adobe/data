import type { World } from "../../../index.js";

/** Stops what `connect` started. */
export type Disconnect = () => void;

/** Connects a feature's events, dispatched within `root`, to runs of `world`. */
export type Connect = (world: World, root: HTMLElement) => Disconnect;

/** Listens for one event type on `root` until the returned function is called. */
export const on = <K extends keyof HTMLElementEventMap>(root: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): Disconnect => {
    root.addEventListener(type, listener);
    return () => root.removeEventListener(type, listener);
};

/** Logs why a run was rejected: a run an event started has no caller to hand it to. Never rejects. */
export const reported = async (run: Promise<number>): Promise<void> => {
    try {
        await run;
    }
    catch (error) {
        console.error("A run was rejected", error);
    }
};
