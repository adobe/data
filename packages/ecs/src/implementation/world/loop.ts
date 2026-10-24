// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Cadence } from '../../interface/resources/cadence.js';
import type { Composite, Definition } from '../../interface/registry/index.js';
import { requireDefinition } from '../../interface/registry/program.js';
import { isLeaf, isObserver, scheduleOf } from '../../interface/registry/schedule.js';
import type { Leaf } from '../../interface/system/leaf.js';

/** What the loop reads of the world's resources before each beat. */
export type LoopSettings = { readonly cadence: Cadence; readonly always: boolean; readonly wake: number };

/** One tick's clock: `now` and `delta` in milliseconds, and how many ticks ran before. */
export type Clock = { now: number; delta: number; tick: number };

/** What the loop needs of the world and the platform; tests give their own timers. */
export type LoopHost = {
    readonly settings: () => LoopSettings;
    /** Runs one tick of `composite` with this clock, through the world's queue. */
    readonly tick: (composite: Composite, clock: Clock) => Promise<void>;
    readonly now: () => number;
    readonly frame: (callback: (time: number) => void) => () => void;
    readonly timer: (callback: () => void, milliseconds: number) => () => void;
};

/** What the loop takes from the platform; a world can be given its own, for tests and benchmarks. */
export type LoopPlatform = Pick<LoopHost, "frame" | "timer" | "now">;

export type Loop = {
    /**
     * Adds a system to every tick from the next one on, or an observer system to the observer systems. Throws for a
     * conflict with one already added, or input.
     */
    readonly add: (system: Definition) => void;
    /**
     * Removes a value `add` was given from every tick from the next one on, returning the composite of the added
     * systems before and after, null while none is added: the same one for an observer system added alone, which leaves
     * it as it is. Null without a change, for a value not added. Throws, removing nothing, when the systems left
     * conflict with no order between them.
     */
    readonly remove: (system: Definition) => { readonly previous: Composite | null; readonly next: Composite | null } | null;
    /** The composite ticks run now: the added systems', or null while none is added that runs in a tier. */
    readonly current: () => Composite | null;
    /**
     * The observer systems to run after every run's and tick's sync point: those added alone and those within added
     * composites, each once. A new array once they change, so a pass in progress keeps the one it started with.
     */
    readonly observer: () => readonly Leaf[];
    /** A run arrived: the next beat runs a tick. */
    readonly arrived: () => void;
    /** Stops ticking; a tick in progress finishes. */
    readonly stop: () => void;
};

/** A beat of a fixed cadence that's behind runs at most this many ticks, unless the cadence says otherwise. */
export const defaultMaxSteps = 4;

/** Milliseconds between beats of a frame cadence where the platform has no animation frames. */
const frameMilliseconds = 1000 / 60;

/** Animation frames where the platform has them, and a timer at 60 per second otherwise. */
export const platformFrame = (callback: (time: number) => void): (() => void) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
        const handle = globalThis.requestAnimationFrame(callback);
        return () => globalThis.cancelAnimationFrame(handle);
    }
    const handle = setTimeout(() => callback(performance.now()), frameMilliseconds);
    return () => clearTimeout(handle);
};

export const platformTimer = (callback: () => void, milliseconds: number): (() => void) => {
    const handle = setTimeout(callback, milliseconds);
    return () => clearTimeout(handle);
};

/**
 * For tests and benchmarks: frames that call back as soon as the event loop takes its next task, through a
 * `MessageChannel` post. A task, so worker messages and `Atomics.waitAsync` settle between ticks, which microtasks
 * would starve; unclamped, as `setTimeout(0)` isn't. `close` releases the channel, which keeps node running while open.
 */
export const backToBack = (): Partial<LoopPlatform> & { readonly close: () => void } => {
    const channel = new MessageChannel();
    let pending: ((time: number) => void) | null = null;
    channel.port1.onmessage = () => {
        const callback = pending;
        pending = null;
        callback?.(performance.now());
    };
    return {
        frame: callback => {
            pending = callback;
            channel.port2.postMessage(null);
            return () => {
                if (pending === callback) pending = null;
            };
        },
        close: () => {
            channel.port1.close();
            channel.port2.close();
        },
    };
};

/** Throws unless every leaf under a system takes no input, since ticks pass none. */
const checkNoInput = (system: Definition, seen: Set<Definition> = new Set()): void => {
    if (seen.has(system)) return;
    seen.add(system);
    if (isLeaf(system)) {
        if (system.input !== undefined) throw new Error(`System "${system.name}" takes input, which ticks don't pass; run it instead.`);
        return;
    }
    for (const member of system.declaration.systems) checkNoInput(requireDefinition(member), seen);
};

const noLeaves: readonly Leaf[] = [];

/**
 * The world's loop: on beats of its cadence, while some system is added that runs in a tier, it runs a tick where
 * `always` is set, `wake` is due or a run arrived since the last tick. A quiet loop schedules nothing until a run
 * arrives or a wake time comes. Observer systems don't make it tick.
 */
export const createLoop = (host: LoopHost): Loop => {
    /** The values added but observer systems added alone, which are in `alone`. */
    const systems: Definition[] = [];
    let composite: Composite | null = null;
    /** `composite` while it has a tier, so ticks run. */
    let ticking: Composite | null = null;
    const alone: Leaf[] = [];
    let observer: readonly Leaf[] = noLeaves;
    const refreshObserver = (): void => {
        const within = composite === null ? noLeaves : scheduleOf(composite).observer;
        observer = within.length === 0 ? [...alone] : [...new Set([...alone, ...within])];
    };
    /** Sets the composite of the added systems, and whether it ticks. */
    const compose = (next: Composite | null): void => {
        composite = next;
        ticking = next !== null && scheduleOf(next).tiers.length > 0 ? next : null;
        refreshObserver();
    };
    let runArrived = false;
    let stopped = false;
    /** A beat or wake timer is pending, cancelled by this. */
    let cancel: (() => void) | null = null;
    /** Whether what's pending is a timer until a wake time, rather than a beat. */
    let waiting = false;
    let running = false;
    let ticks = 0;
    /** The previous tick's time, for a frame cadence's delta. */
    let previous: number | null = null;
    /** Under a fixed cadence, the time ticks have reached; null while quiet, so a quiet loop builds no debt. */
    let reached: number | null = null;
    /** The wake time a tick already ran for, so a wake no system asks for again doesn't tick every beat. */
    let served = Infinity;
    const clock: Clock = { now: 0, delta: 0, tick: 0 };

    const isDue = (settings: LoopSettings, time: number): boolean =>
        settings.always || runArrived || (settings.wake <= time && settings.wake !== served);

    const runTicks = async (settings: LoopSettings, time: number, first: Composite): Promise<void> => {
        const { cadence } = settings;
        const wake = settings.wake;
        if (cadence.kind === "frame") {
            clock.now = time;
            clock.delta = previous === null ? 0 : time - previous;
            clock.tick = ticks++;
            previous = time;
            if (wake <= time) served = wake;
            await host.tick(first, clock);
            return;
        }
        const { step } = cadence;
        const maxSteps = cadence.maxSteps ?? defaultMaxSteps;
        reached ??= time - step;
        const behind = Math.floor((time - reached) / step);
        const count = Math.min(behind, maxSteps);
        const start = reached;
        // Steps past `maxSteps` are dropped, keeping the cadence's phase.
        reached += Math.max(behind, 0) * step;
        if (wake <= time) served = wake;
        for (let i = 1; i <= count; i++) {
            // Each tick runs what's added as it starts: systems removed since the last one aren't in it.
            const current = ticking;
            if (stopped || current === null) return;
            clock.now = start + i * step;
            clock.delta = step;
            clock.tick = ticks++;
            previous = clock.now;
            await host.tick(current, clock);
        }
    };

    const beat = async (time: number): Promise<void> => {
        cancel = null;
        waiting = false;
        if (stopped || ticking === null) return;
        const settings = host.settings();
        if (!isDue(settings, time)) {
            schedule();
            return;
        }
        runArrived = false;
        running = true;
        try {
            await runTicks(settings, time, ticking);
        }
        finally {
            running = false;
        }
        schedule();
    };

    const onBeat = (time: number): void => { void beat(time); };

    /** Schedules the next beat, or a timer until the next wake time, or nothing while the loop is quiet. */
    const schedule = (): void => {
        if (stopped || ticking === null || running || cancel !== null) return;
        const settings = host.settings();
        const { cadence } = settings;
        const now = host.now();
        if (settings.always || runArrived) {
            if (cadence.kind === "frame") cancel = host.frame(onBeat);
            else {
                const delay = reached === null ? 0 : Math.max(0, reached + cadence.step - now);
                cancel = host.timer(() => onBeat(host.now()), delay);
            }
            return;
        }
        // Quiet: a fixed cadence builds no debt until it ticks again.
        reached = null;
        if (settings.wake === Infinity || settings.wake === served) return;
        waiting = true;
        cancel = host.timer(() => {
            cancel = null;
            waiting = false;
            if (cadence.kind === "frame") cancel = host.frame(onBeat);
            else onBeat(host.now());
        }, Math.max(0, settings.wake - now));
    };

    return {
        add: system => {
            if (stopped) throw new Error("The world is disposed.");
            checkNoInput(system);
            if (isObserver(system)) {
                if (alone.includes(system)) return;
                alone.push(system);
                refreshObserver();
                return;
            }
            if (systems.includes(system)) return;
            const next = [...systems, system];
            const candidate: Composite = { kind: "composite", name: "tick", declaration: { systems: next } };
            // Throws for members ordered in a cycle, or conflicting with no order between them.
            scheduleOf(candidate);
            systems.push(system);
            compose(candidate);
            schedule();
        },
        remove: system => {
            if (isObserver(system)) {
                const at = alone.indexOf(system);
                if (at < 0) return null;
                alone.splice(at, 1);
                refreshObserver();
                return { previous: composite, next: composite };
            }
            const at = systems.indexOf(system);
            if (at < 0 || composite === null) return null;
            const left = systems.filter((_, k) => k !== at);
            const next: Composite | null = left.length === 0 ? null : { kind: "composite", name: "tick", declaration: { systems: left } };
            // Throws for members that conflict with no ordering path left between them.
            if (next !== null) scheduleOf(next);
            const previous = composite;
            systems.splice(at, 1);
            compose(next);
            return { previous, next };
        },
        current: () => ticking,
        observer: () => observer,
        arrived: () => {
            if (ticking === null) return;
            runArrived = true;
            if (waiting && cancel !== null) {
                // A wake time may be far off; a run is due on the next beat.
                cancel();
                cancel = null;
                waiting = false;
            }
            schedule();
        },
        stop: () => {
            stopped = true;
            cancel?.();
            cancel = null;
        },
    };
};
