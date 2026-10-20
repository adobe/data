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

/** Logs what a run's report says failed: a run an event started has no caller to hand its failures to. */
export const reported = async (run: Promise<World.Report>): Promise<void> => {
    const report = await run;
    if (report.failures.length > 0) console.error("A run failed", report.failures);
};
