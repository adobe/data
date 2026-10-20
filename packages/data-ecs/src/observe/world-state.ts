import { System, type World } from '../index.js';

// What the factories keep for each world: the values observers share, their subscribers, and the synced systems that
// read the world for them. Every shape of observer is one synced system, never one per subscriber or entity.

/**
 * A subscriber: its notify, null once stopped; the flush its first value waits for, 0 once it had it; and the pass
 * it had it in, so a system later in that pass doesn't notify it again.
 */
export type Subscriber<T> = { notify: ((value: T) => void) | null; batch: number; pass: number };

/**
 * A value observers share, such as a resource's or an entity's: the last value given, `valid` while it's the world's
 * as of the last pass; its subscribers, null where one stopped, `live` of them active and `waiting` for a first value;
 * and how many passes found it without subscribers since it last had one.
 */
export type Entry<T> = {
    value: T;
    valid: boolean;
    readonly subscribers: Subscriber<T>[];
    live: number;
    waiting: number;
    stopped: number;
    idle: number;
};

export const createEntry = <T>(value: T): Entry<T> => ({ value, valid: false, subscribers: [], live: 0, waiting: 0, stopped: 0, idle: 0 });

/**
 * What a shape removes once it's been idle for a whole pass, how many subscribers its entries have, and how many passes
 * the maintenance system found it without them since it last had one.
 */
export type Shape = { live: number; idle: number; readonly remove: () => void };

/** A system a flush runs before it delivers, and what it's told of the flush, by number, when it does. */
export type Read = { readonly system: System; readonly flushed: (batch: number) => void };

/**
 * A world's factories' state: the pass the maintenance system counted last; flushes, `open` the one new cold first
 * values wait for and `delivered` the last whose delivering run reached its pass; what the next flush runs; and idle
 * shapes.
 */
export type WorldState = {
    readonly world: World;
    pass: number;
    open: number;
    delivered: number;
    scheduled: boolean;
    readonly reads: Read[];
    /** Whether the next flush runs the delivering system, for shapes that read in the pass of its run. */
    delivering: boolean;
    /** Work for the next flush's delivering run, in its body, before shapes' systems run in its pass. */
    tasks: (() => void)[];
    /** By delivering run called and not yet run, its flush and its work. */
    readonly deliveries: { readonly batch: number; readonly tasks: readonly (() => void)[] }[];
    readonly idle: Shape[];
    readonly deliver: System;
};

const states = new WeakMap<World, WorldState>();

/** Rethrows an error out of band: it's the caller's, but nothing can return it to them. */
export const rethrowLater = (error: unknown): void => {
    queueMicrotask(() => { throw error; });
};

/** A run of the factories' own, whose report nothing returns: its failures are rethrown out of band. */
const runOwn = (world: World, system: System): void => {
    world.run(system).then(report => {
        for (const failure of report.failures) rethrowLater(new Error(`${failure.name}: ${failure.message}`));
    }, () => {
        // A disposed world runs nothing more: its observers' first values never come.
    });
};

const noTasks: readonly (() => void)[] = [];

/** Runs what subscribers waiting for the open flush need, in call order after every run called before them. */
const flush = (state: WorldState): void => {
    state.scheduled = false;
    const batch = state.open++;
    const { reads, world } = state;
    for (let i = 0; i < reads.length; i++) {
        reads[i].flushed(batch);
        runOwn(world, reads[i].system);
    }
    reads.length = 0;
    if (!state.delivering) return;
    state.delivering = false;
    state.deliveries.push({ batch, tasks: state.tasks.length === 0 ? noTasks : state.tasks });
    if (state.tasks.length > 0) state.tasks = [];
    runOwn(world, state.deliver);
};

/**
 * Removes the shapes found idle in three passes: one used in a pass, before or after this system ran in it, stays
 * through the next two, so loops reading first values between runs stay warm.
 */
const sweepShapes = (state: WorldState): void => {
    const { idle } = state;
    let kept = 0;
    for (let i = 0; i < idle.length; i++) {
        const shape = idle[i];
        if (shape.live > 0) continue;
        if (++shape.idle > 2) {
            shape.remove();
            continue;
        }
        idle[kept++] = shape;
    }
    idle.length = kept;
};

export const stateOf = (world: World): WorldState => {
    let state = states.get(world);
    if (state !== undefined) return state;
    const created: WorldState = {
        world,
        pass: 0,
        open: 1,
        delivered: 0,
        scheduled: false,
        reads: [],
        delivering: false,
        tasks: [],
        deliveries: [],
        idle: [],
        deliver: System.create({ name: "Observe/deliver", synced: true }, () => {
            const delivery = created.deliveries.shift();
            if (delivery === undefined) return;
            created.delivered = delivery.batch;
            for (let i = 0; i < delivery.tasks.length; i++) delivery.tasks[i]();
        }),
    };
    state = created;
    // Added before any shape's system, so in each pass it counts the pass before they run.
    world.add(System.create({ name: "Observe/maintain", synced: true }, () => {
        created.pass++;
        if (created.idle.length > 0) sweepShapes(created);
    }));
    states.set(world, created);
    return created;
};

const schedule = (state: WorldState): void => {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => flush(state));
};

/** Makes the next flush, at the end of this task, deliver first values to subscribers of shapes that read in its pass. */
export const scheduleDelivery = (state: WorldState): void => {
    state.delivering = true;
    schedule(state);
};

/** Makes the next flush run a read, once, before it delivers. */
export const scheduleRead = (state: WorldState, read: Read): void => {
    if (!state.reads.includes(read)) state.reads.push(read);
    schedule(state);
};

/** Runs `task` in the next flush's delivering run, before shapes' systems run in its pass. */
export const onNextDelivery = (state: WorldState, task: () => void): void => {
    scheduleDelivery(state);
    state.tasks.push(task);
};

/** Within a flush, before it delivers: makes it deliver, running `task` in its delivering run. */
export const deliverAlso = (state: WorldState, task: () => void): void => {
    state.delivering = true;
    state.tasks.push(task);
};

/** Marks a shape with no subscribers left, for removal once it's been idle for a pass. */
export const becameIdle = (state: WorldState, shape: Shape): void => {
    shape.idle = 0;
    if (!state.idle.includes(shape)) state.idle.push(shape);
};

/**
 * Subscribes `notify` to an entry: with a valid value, given it now, where a throw stops it and throws to the caller;
 * otherwise waiting for the next flush, which `wait` schedules. Returns the function that stops it.
 */
export const subscribe = <T>(state: WorldState, shape: Shape, entry: Entry<T>, notify: (value: T) => void, wait: () => void): (() => void) => {
    const subscriber: Subscriber<T> = { notify, batch: 0, pass: -1 };
    entry.subscribers.push(subscriber);
    entry.live++;
    entry.idle = 0;
    shape.live++;
    shape.idle = 0;
    let active = true;
    const stop = (): void => {
        if (!active) return;
        active = false;
        if (subscriber.notify !== null) {
            subscriber.notify = null;
            entry.stopped++;
        }
        entry.live--;
        if (subscriber.batch !== 0) {
            subscriber.batch = 0;
            entry.waiting--;
        }
        if (--shape.live === 0) becameIdle(state, shape);
    };
    if (entry.valid) {
        try {
            notify(entry.value);
        }
        catch (error) {
            stop();
            throw error;
        }
        return stop;
    }
    subscriber.batch = state.open;
    entry.waiting++;
    wait();
    return stop;
};

/** Drops an entry's stopped subscribers. */
export const sweepSubscribers = <T>(entry: Entry<T>): void => {
    if (entry.stopped === 0) return;
    const { subscribers } = entry;
    let kept = 0;
    for (let i = 0; i < subscribers.length; i++) if (subscribers[i].notify !== null) subscribers[kept++] = subscribers[i];
    subscribers.length = kept;
    entry.stopped = 0;
};

/** No error, as `give` returns it. */
export const none: unique symbol = Symbol("Observe/none");

/**
 * Gives an entry's value to its subscribers: a first value to each waiting for a flush up to `through`, whose throw
 * stops it and is rethrown out of band; and with `changed`, the value to the others but those that had their first in
 * pass `fresh`. Subscribers added meanwhile wait for a later pass. Returns the first error a later value's notify
 * threw, or `failed` when it's already one.
 */
export const give = <T>(entry: Entry<T>, through: number, changed: boolean, pass: number, fresh: number, failed: unknown): unknown => {
    let error = failed;
    const { subscribers } = entry;
    const value = entry.value;
    for (let i = 0, count = subscribers.length; i < count; i++) {
        const subscriber = subscribers[i];
        const notify = subscriber.notify;
        if (notify === null) continue;
        if (subscriber.batch !== 0) {
            if (subscriber.batch > through) continue;
            subscriber.batch = 0;
            subscriber.pass = pass;
            entry.waiting--;
            try {
                notify(value);
            }
            catch (thrown) {
                // As a joined thread's first values are, it's thrown where nothing can catch it.
                if (subscriber.notify !== null) {
                    subscriber.notify = null;
                    entry.stopped++;
                }
                rethrowLater(thrown);
            }
            continue;
        }
        if (!changed || subscriber.pass === fresh) continue;
        try {
            notify(value);
        }
        catch (thrown) {
            if (error === none) error = thrown;
        }
    }
    return error;
};

/** Throws what a notify threw, so its system's run reports it. */
export const throwFailed = (failed: unknown): void => {
    if (failed !== none) throw failed;
};

const numbers = new Map<symbol, number>();

/** A key's number in this program, for keys of shapes. */
export const numberOf = (key: symbol): number => {
    let number = numbers.get(key);
    if (number === undefined) numbers.set(key, number = numbers.size + 1);
    return number;
};

/** A stable key for a list of component keys. */
export const keysId = (keys: readonly symbol[]): string => {
    let id = "";
    for (let i = 0; i < keys.length; i++) id += `${numberOf(keys[i])},`;
    return id;
};

/** A label for a list of keys, by their descriptions. */
export const labelOf = (keys: readonly symbol[]): string => keys.map(key => key.description ?? "?").join(", ");
