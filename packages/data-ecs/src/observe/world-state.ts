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

/**
 * A system a flush runs before it delivers, and what it's told of the flush, by number, when it does; on a joined
 * thread, `delivered` once the run resolved, a post for it having run there.
 */
export type Read = { readonly system: System; readonly flushed: (batch: number) => void; readonly delivered: (batch: number) => void };

/**
 * A world's factories' state: the pass the maintenance system counted last; flushes, `open` the one new cold first
 * values wait for and `delivered` the last whose delivering run reached its pass; what the next flush runs; and idle
 * shapes.
 */
export type WorldState = {
    readonly world: World;
    /**
     * Whether `world` is a joined thread's: its synced systems run there in posts, in no order with one another, so
     * a shape's first values come once a run of its own system resolved, rather than from a delivering run.
     */
    readonly joined: boolean;
    /** On a joined thread, whether this turn of its event loop counted a pass, and what ends it once its posts ran. */
    counted: boolean;
    readonly endTurn: () => void;
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
    /** What a rejected run of the factories' own does. */
    readonly rejected: (error: unknown) => void;
};

const states = new WeakMap<World, WorldState>();

/** Rethrows an error out of band: it's the caller's, but nothing can return it to them. */
export const rethrowLater = (error: unknown): void => {
    queueMicrotask(() => { throw error; });
};

/**
 * The names of the systems the factories make. A run of theirs runs every synced system the world added too; only these
 * systems' failures are the factories' to rethrow.
 */
const ownNames = new Set<string>();

/** Names a system the factories make. */
export const ownName = (name: string): string => {
    ownNames.add(name);
    return name;
};

const rethrowFailures = (report: { readonly failures: readonly { readonly name: string; readonly message: string }[] }): void => {
    for (const failure of report.failures) if (ownNames.has(failure.name)) rethrowLater(new Error(`${failure.name}: ${failure.message}`));
};

const ignore = (): void => {
    // A disposed world runs nothing more: its observers' first values never come.
};

/** Runs nothing: a run of it resolves while its world lives. */
const alive = System.create({ name: ownName("Observe/alive"), synced: true }, () => {});

/**
 * What a rejected run of the factories' own does: nothing for a disposed world, whose first values never come, and for
 * a live one, such as one whose system failed to register, rethrows the rejection out of band.
 */
const rejectedOf = (world: World) => (error: unknown): void => {
    world.run(alive).then(() => rethrowLater(error), ignore);
};

/** A run of the factories' own, whose report nothing returns: its failures, and its rejection, are rethrown out of band. */
const runOwn = (state: WorldState, system: System): void => {
    state.world.run(system).then(rethrowFailures, state.rejected);
};

const noTasks: readonly (() => void)[] = [];

/** A run of a joined thread's shape for first values: once it resolved, a post for it ran there, so `read` gives them. */
const runJoined = (state: WorldState, read: Read, batch: number): void => {
    state.world.run(read.system).then(report => {
        rethrowFailures(report);
        read.delivered(batch);
    }, state.rejected);
};

/** Runs what subscribers waiting for the open flush need, in call order after every run called before them. */
const flush = (state: WorldState): void => {
    state.scheduled = false;
    const batch = state.open++;
    const { reads, world } = state;
    if (state.joined) {
        for (let i = 0; i < reads.length; i++) runJoined(state, reads[i], batch);
        reads.length = 0;
        return;
    }
    for (let i = 0; i < reads.length; i++) {
        reads[i].flushed(batch);
        runOwn(state, reads[i].system);
    }
    reads.length = 0;
    if (!state.delivering) return;
    state.delivering = false;
    state.deliveries.push({ batch, tasks: state.tasks.length === 0 ? noTasks : state.tasks });
    if (state.tasks.length > 0) state.tasks = [];
    runOwn(state, state.deliver);
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

/** A system no world adds, which only a joined thread's `remove` refuses, since it isn't synced. */
const probe = System.create({ name: "Observe/probe" }, () => {});

/** Whether `world` is a joined thread's: its `remove` takes only synced systems, where the world's ignores one never added. */
const isJoined = (world: World): boolean => {
    try {
        world.remove(probe);
        return false;
    }
    catch {
        return true;
    }
};

/**
 * On a joined thread, counts a pass once per turn of its event loop that ran a shape's system, and sweeps idle shapes
 * after the turn's posts ran, for no system orders passes there.
 */
export const passed = (state: WorldState): void => {
    if (!state.joined || state.counted) return;
    state.counted = true;
    state.pass++;
    queueMicrotask(state.endTurn);
};

export const stateOf = (world: World): WorldState => {
    let state = states.get(world);
    if (state !== undefined) return state;
    const joined = isJoined(world);
    const created: WorldState = {
        world,
        joined,
        counted: false,
        endTurn: () => {
            created.counted = false;
            if (created.idle.length > 0) sweepShapes(created);
        },
        pass: 0,
        open: 1,
        delivered: 0,
        scheduled: false,
        reads: [],
        delivering: false,
        tasks: [],
        deliveries: [],
        idle: [],
        rejected: rejectedOf(world),
        deliver: System.create({ name: ownName("Observe/deliver"), synced: true }, () => {
            const delivery = created.deliveries.shift();
            if (delivery === undefined) return;
            created.delivered = delivery.batch;
            for (let i = 0; i < delivery.tasks.length; i++) delivery.tasks[i]();
        }),
    };
    state = created;
    states.set(world, created);
    if (joined) return created;
    // Added before any shape's system, so in each pass it counts the pass before they run.
    world.add(System.create({ name: ownName("Observe/maintain"), synced: true }, () => {
        created.pass++;
        if (created.idle.length > 0) sweepShapes(created);
    }));
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

/** A read's step that does nothing. */
export const noDelivery = (): void => {
    // A read on one kind of thread has nothing to do at the step the other's flush takes.
};

/** Makes the next flush run a read, once, before it delivers; on a joined thread, once, giving first values once it resolved. */
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
    // Before a first value given in a pass, its pass is one `give` never skips: not -1, which skips none.
    const subscriber: Subscriber<T> = { notify, batch: 0, pass: -2 };
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
 * pass `fresh`, -1 for none. Subscribers added meanwhile wait for a later pass. Returns the first error a later value's notify
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

/** On a joined thread, gives an entry's first values to subscribers waiting for a flush up to `through`, once it holds one. */
export const giveFirst = <T>(state: WorldState, entry: Entry<T>, through: number): void => {
    if (entry.waiting === 0 || !entry.valid) return;
    give(entry, through, false, state.pass, -1, none);
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
