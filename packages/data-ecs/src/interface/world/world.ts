import type { Input } from '../system/input.js';
import type { System } from '../system/system.js';
import type { Observers } from './observers.js';
import type { Report } from './report.js';

/**
 * A world. Observing is the way to read it: an observer's first value may come during the subscribing call or later,
 * then one after each run or tick that changed it; nothing promises a notification before a run resolves.
 * Every member's type is named from the package root, such as `Observers` for `observe`, so declarations a consumer
 * emits for its results name no internal module.
 */
export type World = {
    /**
     * The one way to change state. Runs are sequential in call order; physically, any that don't conflict overlap. Each
     * runs a system or composite, ending in a sync point, and resolves to what went wrong, if anything: systems,
     * finalizers, GPU work and observers that failed, systems skipped after a failed tier, and commands that did
     * nothing. Rejects only when the run can't happen or finish: registration fails, the world is disposed, its GPU
     * device is lost, or its sync point can't apply a command's value. Synced systems, the run's and those added, run
     * after its sync point, before it resolves, their throws `"system"` failures in its report; a run of synced systems
     * alone runs them once after an empty sync point, and doesn't wake the loop.
     */
    run<I>(system: System<I>, ...input: Input<NoInfer<I>>): Promise<Report>;
    /**
     * Adds a system to every tick, from the next one on, ordered with those already added by its constraints, as a
     * composite's members are. A tick runs on a beat of the `cadence` resource where `always` is set, `wake` is due or
     * a run arrived since the last tick, and only while some system is added. Throws for a system with no ordering path
     * to one already added that conflicts with it, and on a joined thread; failures appear in the `report` resource.
     * A synced system runs after every run's and tick's sync point instead. It never conflicts and doesn't count as an
     * added system for ticking. In a tick it sees the tick's report, which then holds its failures without notifying
     * again.
     */
    add(system: System<void>): void;
    /**
     * Takes a value passed to `add`. Once it returns, that system's body is never called again, and its memory is
     * released. A system added both alone and within an added composite stays until both are removed; constraints
     * naming a removed system are ignored. Removing a value that isn't added does nothing. Throws, removing nothing, when
     * the systems left would conflict with no ordering path between them, as `add` does, and on a joined thread.
     */
    remove(system: System<void>): void;
    readonly observe: Observers;
    /**
     * Lets another thread join this world through `port`, one end of a channel to it, of the browser or node: a
     * `MessagePort`, a `Worker`, or a worker's own scope, `self` or node's `parentPort`. That thread joins through the
     * other end, claiming the logical threads it fills; a thread claimed twice can't join. Throws on a joined thread,
     * and where memory can't be shared, as without cross-origin isolation.
     */
    share(port: { readonly postMessage: (message: never, transfer: never) => void } & (
        | { readonly addEventListener: (type: "message", listener: (event: unknown) => void) => void }
        | { readonly on: (event: "message", listener: (value: unknown) => void) => unknown }
    )): void;
    /**
     * Waits for pending runs, then stops ticking and releases memory, and joined threads' runs reject; the world is
     * unusable afterwards. On a joined thread, it disconnects this thread.
     */
    dispose(): Promise<void>;
    [Symbol.asyncDispose](): Promise<void>;
};

export type * as World from './index.js';
