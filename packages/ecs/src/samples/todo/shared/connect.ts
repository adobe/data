import type { World } from "../../../index.js";

/** Stops what `connect` started. */
export type Disconnect = () => void;

/**
 * Connects a feature's events, dispatched within `root`, to runs of `world`. A run's failures are in its report, which
 * the app logs; a rejected run goes unhandled, which the browser logs.
 */
export type Connect = (world: World, root: HTMLElement) => Disconnect;

/** Stops every one of `disconnects`. */
export const all = (...disconnects: readonly Disconnect[]): Disconnect => () => {
    for (const disconnect of disconnects) disconnect();
};

/** Listens for one event type on `root` until the returned function is called. */
export const on = <K extends keyof HTMLElementEventMap>(root: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): Disconnect => {
    root.addEventListener(type, listener);
    return () => root.removeEventListener(type, listener);
};
