import type { Entity } from '../../interface/entity/entity.js';
import type { Observe } from '../../interface/observe/observe.js';
import type { World } from '../../interface/world/world.js';
import type { Failure, Report } from '../../interface/world/report.js';
import { definitionOf, firstKeyOf, idOfKey, indexDefinitionOf, itemOfId, keyOfId, labelOf, labelOfItem, requireDefinition, type Definition } from '../../interface/registry/index.js';
import type { Layout, Views } from '../../interface/registry/layout.js';
import { asEntity } from './entities.js';
import { failureOf } from './failures.js';
import {
    clean, completedWord, controlBytes, inputByMessage, inputLayoutOf, inputMoved, platformLocks, postedWord, protocolName, rejected, reported, runSlots,
    signalWord, unreadWord, slotInput, slotNumber, slotPayload, slotStatus, slotViews, slotWords, slotsWord, threadChannel, unposted,
    type Subscription, type SyncedDeclaration, type SyncedIndex, type ThreadChannel, type ToJoined, type ToWorld,
} from './joining.js';
import { createSyncedTarget, droppedSynced, endTarget, joinedRun, type SyncedTarget } from './joined-synced.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { Index } from '../../interface/indexes/index-type.js';
import { System } from '../../interface/system/system.js';
import { alignFor, createMailbox, entityPlanOf, freeMailbox, publishSlot, writeSlot, writeValue, type MailboxWriter } from './mailbox.js';
import { createMoveLog, freeMoveLog, type MoveLog } from './move-log.js';
import { lineWords } from './protocol.js';
import { claimThreads, releaseThreads } from './remote.js';
import { createTaskChannel, type TaskChannel } from './remote-systems.js';
import { endStops } from './stop-lists.js';
import type { EntityOptions, QueryOptions } from './reads.js';
import { idOf, type Key, type State } from './state.js';
import { heldInput, type HeldInput } from './transfers.js';

type Notify = (value: unknown) => void;
type Subscribe = (notify: Notify) => () => void;

/** What sharing needs of the world. */
export type SharingHost = {
    readonly state: State;
    /** Runs a system as `world.run` does. */
    readonly run: (definition: Definition, input: unknown) => Promise<Report>;
    readonly observers: {
        readonly resource: (key: Key) => Subscribe;
        /** With `owner`, a joined thread's log: that thread's objects are present, read there. */
        readonly entity: (entity: Entity, options: EntityOptions | undefined, owner: MoveLog | null) => Subscribe;
        readonly query: (options: QueryOptions, counting: boolean) => Subscribe;
    };
    /** A failure for the next run's report, as an observer's first value given through the queue is. */
    readonly defer: (failure: Failure) => void;
    /**
     * Why a joined thread that imported the systems of ids `imported` can't claim `threads`: a system it can't run there,
     * or a finalizer on one; null when none.
     */
    readonly crossing: (threads: readonly string[], imported: ReadonlySet<string>) => string | null;
    /** Places systems again, once claims were made or released. */
    readonly placed: () => void;
    /** Runs a task between runs, in the world's queue. */
    readonly between: (task: () => void) => void;
    /** A joined thread's own synced systems, as the world declares them: added to ticks, removed, or forgotten. */
    readonly synced: {
        readonly add: (system: Definition) => void;
        readonly remove: (system: Definition) => void;
        readonly drop: (system: Definition) => void;
    };
};

/** A number a joined thread gave a key or system, with its id, and what the id names here, or null for nothing. */
type Named = { readonly id: string; readonly value: Key | Definition | null };

/** A joined thread's observer: what stops the world's observer, and its mailbox. */
type Watching = { readonly stop: () => void; readonly mailbox: MailboxWriter };

/**
 * A thread's progress as the world shows it: `"joining"` until it has joined, `"joined"` once the threads it claims
 * are its own, then `"gone"` once it disconnected, died or couldn't join, and its claims are released.
 */
export type ThreadProgress = { readonly status: "joining" | "joined" | "gone"; readonly claims: readonly string[] };

/** A thread that joined, or is joining, through a port this world shared. */
type Joined = {
    readonly channel: ThreadChannel<ToJoined, ToWorld>;
    status: "joining" | "joined" | "gone";
    claims: readonly string[];
    /** Its control words and run slots, in the memory; null until it joined, and once it left. */
    control: Int32Array | null;
    views: readonly Views[];
    /** Whether it waits without blocking, so `Atomics.notify` wakes it. */
    waits: boolean;
    readonly names: Map<number, Named>;
    /** The next run to start, the last one completed, and those finished out of order. */
    next: number;
    completed: number;
    readonly finished: Set<number>;
    /** Inputs posted for runs not yet started. */
    readonly inputs: Map<number, unknown>;
    /** For runs not yet started whose input moved to the joined thread their system runs on: that thread, once it has it. */
    readonly moved: Map<number, Joined>;
    /** The joined threads it has a channel to, to move inputs through. */
    readonly peers: Set<Joined>;
    readonly watching: Map<number, Watching>;
    /** Whether a wake is queued for it. */
    woken: boolean;
    /** Ends the world's request for its lock. */
    readonly abort: AbortController;
    /** Its log, once the objects of the threads it claims are its own; and its number, which storage flags name. */
    log: MoveLog | null;
    readonly number: number;
    /** The ids of the systems it imported, which those placed on it must be among. */
    imported: ReadonlySet<string>;
    /** Its task channel, once systems placed on the threads it claims run there. */
    tasks: TaskChannel | null;
    /** Its end for synced systems, once it joined. */
    synced: SyncedTarget | null;
    /** Its own synced systems, as the world declares them, by its numbers for them. */
    readonly proxies: Map<number, Leaf>;
};

const hasWaitAsync = (): boolean => typeof Atomics.waitAsync === "function";

const isClean = (report: Report): boolean => report.failures.length === 0 && report.skipped.length === 0 && report.dropped === 0 && report.warnings.length === 0;

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * The world's side of joined threads: `share` records a thread joining, then its handshake records its claims, which
 * a thread claimed twice can't join; `progress` shows each one's, in the order they were shared. Runs come through its slots in shared memory, in
 * sequence, naming systems by its numbers, and complete through its completed word, with a report posted only when
 * it isn't clean. Its observers are the world's own, writing each value into a mailbox, with one notify per thread
 * per batch of deliveries.
 */
export const createSharing = (host: SharingHost) => {
    const { state } = host;
    const memory = state.memory;
    const threads = new Set<Joined>();
    /** Logical threads by the joined thread claiming them. */
    const claimed = new Map<string, Joined>();
    let closed = false;
    const waking: Joined[] = [];
    /** Each joined thread's block of control words, as allocated. */
    const controlBlocks = new Map<Joined, number>();
    /** Joined threads' numbers, never reused, so a thread that died never reads another's flags as its own; those not gone, by number. */
    let numbered = 0;
    const byNumber = new Map<number, Joined>();

    const post = (thread: Joined, message: ToJoined, transfer?: readonly object[]): void => thread.channel.post(message, transfer);

    /** Every shared thread's progress, by its number, and those observing it. */
    let progress: readonly ThreadProgress[] = [];
    const watchers = new Set<(value: readonly ThreadProgress[]) => void>();
    const show = (thread: Joined, status: ThreadProgress["status"]): void => {
        const next = [...progress];
        next[thread.number - 1] = { status, claims: thread.claims };
        progress = next;
        for (const notify of [...watchers]) notify(progress);
    };
    const observeProgress: Observe<readonly ThreadProgress[]> = notify => {
        watchers.add(notify);
        notify(progress);
        return () => { watchers.delete(notify); };
    };

    const wake = (thread: Joined): void => {
        const { control } = thread;
        if (control === null) return;
        Atomics.add(control, signalWord, 1);
        // A thread that hasn't read the last wake yet reads this one with it.
        if (Atomics.exchange(control, unreadWord, 1) !== 0) return;
        Atomics.notify(control, signalWord);
        if (!thread.waits) post(thread, { protocol: protocolName, kind: "wake" });
    };

    /** Wakes every thread with something new once, after the deliveries or completions of this turn. */
    const flush = (): void => {
        for (const thread of waking) {
            thread.woken = false;
            wake(thread);
        }
        waking.length = 0;
    };

    const wakeSoon = (thread: Joined): void => {
        if (thread.woken) return;
        thread.woken = true;
        if (waking.push(thread) === 1) queueMicrotask(flush);
    };

    /** A run finished: its status in its slot, its report posted unless clean, and completed advanced through those in order. */
    const finish = (thread: Joined, sequence: number, status: number, message: ToJoined | null): void => {
        const { control } = thread;
        if (control === null || thread.status === "gone") return;
        if (message !== null) post(thread, message);
        Atomics.store(control, slotsWord + ((sequence - 1) % runSlots) * slotWords + slotStatus, status);
        thread.finished.add(sequence);
        let completed = thread.completed;
        while (thread.finished.delete(completed + 1)) completed++;
        if (completed === thread.completed) return;
        thread.completed = completed;
        Atomics.store(control, completedWord, completed);
        wakeSoon(thread);
    };

    const reject = (thread: Joined, sequence: number, text: string): void =>
        finish(thread, sequence, rejected, { protocol: protocolName, kind: "rejected", sequence, message: text });

    /** Run `sequence` of `thread`, whose input moved to `holder`, finished: if no task there took it, it's released there. */
    const released = (holder: Joined | null, thread: Joined, sequence: number, held: HeldInput | null = null): void => {
        if (holder !== null && holder.status === "joined" && held?.taken !== true) post(holder, { protocol: protocolName, kind: "release", from: thread.number, sequence });
    };

    /** The joined thread holding a run's moved input, its claims made, by the number its slot names; null once it's gone. */
    const holderOf = (thread: Joined, number: number): Joined | null => {
        const holder = number === thread.number ? thread : byNumber.get(number);
        return holder !== undefined && holder.status === "joined" && holder.tasks !== null ? holder : null;
    };

    /**
     * Starts the runs posted in its slots, in order, through `run`, so they land in call order with the world's own; a
     * run whose system's id or input hasn't arrived yet waits, with the runs after it.
     */
    const drain = (thread: Joined): void => {
        const { control } = thread;
        if (control === null || thread.status !== "joined") return;
        const posted = Atomics.load(control, postedWord);
        while (thread.next <= posted) {
            const sequence = thread.next;
            const slot = (sequence - 1) % runSlots;
            const base = slotsWord + slot * slotWords;
            const number = control[base + slotNumber];
            if (number === unposted) {
                thread.next++;
                reject(thread, sequence, "The run's input couldn't be posted.");
                continue;
            }
            const named = thread.names.get(number);
            if (named === undefined) return;
            const bytes = control[base + slotInput];
            if (bytes === inputByMessage && !thread.inputs.has(sequence)) return;
            // A moved input waits until the thread it moved to has it; this thread's own has it already.
            const holder = bytes === inputMoved ? holderOf(thread, control[base + slotPayload]) : null;
            if (holder !== null && holder !== thread && thread.moved.get(sequence) !== holder) return;
            thread.next++;
            const input = bytes === inputByMessage ? thread.inputs.get(sequence) : undefined;
            if (bytes === inputByMessage) thread.inputs.delete(sequence);
            else if (bytes === inputMoved) {
                thread.moved.delete(sequence);
                if (holder === null) {
                    reject(thread, sequence, "The run's input moved to a joined thread that's gone.");
                    continue;
                }
            }
            const definition = typeof named.value === "object" && named.value !== null ? named.value : null;
            // A run of the thread's own synced system names it, so its post runs it there for this run.
            const own = definition !== null && definition.kind !== "composite" && thread.proxies.get(number) === definition;
            if (definition === null) {
                reject(thread, sequence, `System "${named.id}" isn't one this world imported, so it can't run here.`);
                released(holder, thread, sequence);
                continue;
            }
            const layout = bytes >= 0 && definition.kind !== "composite" ? inputLayoutOf(definition, definition.declaration.input) : null;
            const held = holder !== null && holder.tasks !== null ? heldInput(thread.number, sequence, holder.tasks) : null;
            const value = own ? joinedRun(sequence) : held ?? (layout !== null && layout.kind === "linear" ? layout.read(thread.views[slot], 0) : input);
            let ran: Promise<Report>;
            try {
                ran = host.run(definition, value);
            }
            catch (error) {
                reject(thread, sequence, messageOf(error));
                released(holder, thread, sequence);
                continue;
            }
            const settled = ran.then(
                report => isClean(report) ? finish(thread, sequence, clean, null) : finish(thread, sequence, reported, { protocol: protocolName, kind: "report", sequence, report }),
                error => reject(thread, sequence, messageOf(error)),
            );
            if (held !== null) void settled.then(() => released(holder, thread, sequence, held));
        }
    };

    /** Starts what runs it posts as they're posted, waiting on its posted word without blocking. */
    const listen = async (thread: Joined): Promise<void> => {
        const { control } = thread;
        while (control !== null && thread.status === "joined" && !closed) {
            const seen = Atomics.load(control, postedWord);
            drain(thread);
            const waited = Atomics.waitAsync(control, postedWord, seen);
            if (waited.async) await waited.value;
        }
    };

    const keyOf = (thread: Joined, number: number): Key => {
        const value = thread.names.get(number)?.value;
        if (typeof value !== "symbol") throw new Error(`A joined thread observes "${thread.names.get(number)?.id ?? number}", which isn't a key this world imported.`);
        return value;
    };

    /** A key's layout, for an observer of a joined thread's: an object only if it's that thread's own, `owner`, read there. */
    const layoutOfKey = (owner: MoveLog | null, key: Key, what: string): Layout => {
        const id = idOf(state, key);
        const layout = state.layouts[id];
        if (layout.kind === "object" && (owner === null || state.remote[id] !== owner)) throw new Error(`${what} reads "${labelOf(key)}", an object, which another thread can't read.`);
        return layout;
    };

    /** The world's observer for a joined thread's subscription, writing each value into the mailbox. */
    const subscribe = (thread: Joined, mailbox: MailboxWriter, subscription: Subscription): (() => void) => {
        const delivered = (): void => {
            publishSlot(mailbox);
            wakeSoon(thread);
        };
        switch (subscription.kind) {
            case "resource": {
                const key = keyOf(thread, subscription.key);
                const layout = state.layouts[idOf(state, key)];
                if (layout.kind === "object") throw new Error(`An observer reads "${labelOf(key)}", an object, which another thread can't read.`);
                const bytes = layout.kind === "linear" ? layout.stride : 8;
                return host.observers.resource(key)(value => {
                    writeValue(writeSlot(mailbox, bytes), layout, 0, value);
                    delivered();
                });
            }
            case "entity": {
                const required = subscription.required.map(number => keyOf(thread, number));
                const optional = subscription.optional.map(number => keyOf(thread, number));
                const keys = [...required, ...optional];
                const layouts = keys.map(key => layoutOfKey(thread.log, key, "An observer"));
                const plan = entityPlanOf(layouts);
                // Its own objects are present here, and read there.
                return host.observers.entity(asEntity(subscription.entity), { required, optional }, thread.log)(observed => {
                    const value = typeof observed === "object" ? observed : null;
                    const views = writeSlot(mailbox, plan.bytes);
                    views.f64[0] = value === null ? 0 : 1;
                    if (value !== null) for (let k = 0; k < keys.length; k++) {
                        const present = Object.hasOwn(value, keys[k]);
                        views.u8[8 + k] = present ? 1 : 0;
                        if (present && plan.offsets[k] >= 0) writeValue(views, layouts[k], plan.offsets[k], Reflect.get(value, keys[k]));
                    }
                    delivered();
                });
            }
            case "whole": {
                // By the first symbol of each key it knows: its number for that key.
                const numbers = new Map<Key, number>();
                for (const number of subscription.known) {
                    const value = thread.names.get(number)?.value;
                    if (typeof value === "symbol") numbers.set(firstKeyOf(value), number);
                }
                const listed: { number: number; layout: Layout; value: unknown }[] = [];
                return host.observers.entity(asEntity(subscription.entity), undefined, thread.log)(observed => {
                    const value = typeof observed === "object" ? observed : null;
                    listed.length = 0;
                    if (value !== null) for (const key of Object.getOwnPropertySymbols(value)) {
                        const number = numbers.get(firstKeyOf(key));
                        const id = idOf(state, key);
                        const layout = state.layouts[id];
                        // Its own objects, present, with their values read there.
                        if (number !== undefined && (layout.kind !== "object" || (thread.log !== null && state.remote[id] === thread.log))) listed.push({ number, layout, value: Reflect.get(value, key) });
                    }
                    let cursor = 8 + 8 * listed.length;
                    const offsets = listed.map(({ layout }) => {
                        const offset = alignFor(layout, cursor);
                        if (layout.kind === "linear") cursor = offset + layout.stride;
                        return offset;
                    });
                    const views = writeSlot(mailbox, cursor);
                    views.f64[0] = value === null ? -1 : listed.length;
                    for (let k = 0; k < listed.length; k++) {
                        views.u32[2 + 2 * k] = listed[k].number;
                        views.u32[3 + 2 * k] = offsets[k];
                        writeValue(views, listed[k].layout, offsets[k], listed[k].value);
                    }
                    delivered();
                });
            }
            default: {
                const where: { [key: Key]: unknown } = {};
                for (const [number, value] of subscription.where) {
                    const key = keyOf(thread, number);
                    layoutOfKey(null, key, "A query's where");
                    where[key] = value;
                }
                const order: { [key: Key]: boolean } = {};
                for (const [number, ascending] of subscription.order) {
                    const key = keyOf(thread, number);
                    layoutOfKey(null, key, "A query's order");
                    order[key] = ascending;
                }
                const options: QueryOptions = {
                    required: subscription.required.map(number => keyOf(thread, number)),
                    not: subscription.not.map(number => keyOf(thread, number)),
                    where, order, ...subscription.page === null ? {} : { page: subscription.page },
                };
                if (subscription.kind === "count") return host.observers.query(options, true)(value => {
                    writeSlot(mailbox, 8).f64[0] = Number(value);
                    delivered();
                });
                return host.observers.query(options, false)(value => {
                    // A selection is a list of entities.
                    const entities = value as readonly number[];
                    const views = writeSlot(mailbox, 8 + 8 * entities.length);
                    views.f64[0] = entities.length;
                    views.f64.set(entities, 1);
                    delivered();
                });
            }
        }
    };

    const observe = (thread: Joined, observer: number, subscription: Subscription): void => {
        const mailbox = createMailbox(memory);
        try {
            thread.watching.set(observer, { stop: subscribe(thread, mailbox, subscription), mailbox });
        }
        catch (error) {
            freeMailbox(mailbox);
            host.defer(failureOf("observer", `a joined thread's observer #${observer}`, error));
            return;
        }
        // The thread reads the mailbox once this arrives, a first value written into it already included.
        post(thread, { protocol: protocolName, kind: "mailbox", observer, offset: mailbox.offset });
    };

    const unobserve = (thread: Joined, observer: number): void => {
        const watching = thread.watching.get(observer);
        if (watching === undefined) return;
        thread.watching.delete(observer);
        watching.stop();
        freeMailbox(watching.mailbox);
    };

    /**
     * Gives a thread that just joined a channel to each joined thread it may move a run's input to, or that may move
     * one to it: every pair one of which fills objects, its claims made. A thread whose claims are pending is paired
     * once they're made.
     */
    const pair = (thread: Joined): void => {
        if (typeof globalThis.MessageChannel !== "function") return;
        const fills = thread.tasks !== null;
        for (const other of threads) {
            if (other === thread || other.status !== "joined" || other.peers.has(thread)) continue;
            const otherFills = other.tasks !== null;
            if (other.claims.length > 0 && !otherFills) continue;
            if (!fills && !otherFills) continue;
            const { port1, port2 } = new MessageChannel();
            thread.peers.add(other);
            other.peers.add(thread);
            post(thread, { protocol: protocolName, kind: "peer", thread: other.number, threads: other.claims, port: port1 }, [port1]);
            post(other, { protocol: protocolName, kind: "peer", thread: thread.number, threads: thread.claims, port: port2 }, [port2]);
        }
    };

    /** Tells a thread a component whose objects it fills, by its id. */
    const announce = (thread: Joined, component: number): void => {
        const key = state.keys[component];
        post(thread, { protocol: protocolName, kind: "component", component, id: typeof key === "symbol" ? idOfKey(key) ?? null : null });
    };

    /**
     * Its claims checked against those already made, and against systems and finalizers on them; its control words
     * placed, and its status `"joined"`; or refused. With claims, its objects become its own between runs, then it's told.
     */
    const refuse = (thread: Joined, message: string): void => {
        post(thread, { protocol: protocolName, kind: "refused", message });
        gone(thread);
    };

    const join = (thread: Joined, threads: readonly string[], waits: boolean, lock: string | null, imported: readonly string[]): void => {
        if (thread.status !== "joining") return;
        const locks = platformLocks();
        // Granted once the thread no longer holds it: it left, or ended.
        if (lock !== null && locks !== null) locks.request(lock, { signal: thread.abort.signal }, () => gone(thread)).catch(() => {});
        thread.imported = new Set(imported);
        const twice = threads.find((name, at) => name === "world" || threads.indexOf(name) < at || claimed.has(name));
        const placed = twice === undefined ? host.crossing(threads, thread.imported) : null;
        if (twice !== undefined || placed !== null) return refuse(thread, placed ?? (twice === "world" ? `A joined thread can't claim "world", the world's own thread.` : `Thread "${twice}" is claimed twice.`));
        for (const name of threads) claimed.set(name, thread);
        thread.claims = threads;
        thread.waits = waits;
        const offset = memory.allocate(controlBytes + lineWords * 4);
        const start = Math.ceil(offset / (lineWords * 4)) * lineWords * 4;
        thread.control = new Int32Array(memory.memory.buffer, start, controlBytes / 4).fill(0);
        controlBlocks.set(thread, offset);
        thread.views = slotViews(memory.memory.buffer, start);
        thread.status = "joined";
        thread.synced = createSyncedTarget(thread.number, threads.length === 0 ? `#${thread.number}` : threads.join(`" and "`), message => post(thread, message), () => wakeSoon(thread));
        const joined = (): void => post(thread, {
            protocol: protocolName, kind: "joined", memory: memory.memory, control: start, waits: hasWaitAsync(), log: thread.log?.block ?? null,
            tasks: thread.tasks?.block ?? null, thread: thread.number,
        });
        if (threads.length === 0) {
            joined();
            pair(thread);
            show(thread, "joined");
        }
        else host.between(() => {
            if (thread.status !== "joined") return;
            // Systems registered since it asked to join are checked too.
            const crossing = host.crossing(threads, thread.imported);
            if (crossing !== null) return refuse(thread, crossing);
            const log = createMoveLog(memory, thread.number, state.starts, component => announce(thread, component));
            thread.log = log;
            claimThreads(state, log, threads);
            const tasks = createTaskChannel(state, log, message => post(thread, message), () => wake(thread), threads.join(`" and "`), number => {
                const value = thread.names.get(number)?.value;
                return typeof value === "symbol" ? idOf(state, value) : -1;
            });
            thread.tasks = tasks;
            for (const name of threads) state.threadTasks.set(name, tasks);
            const { synced } = thread;
            if (synced !== null) {
                synced.log = log;
                for (const name of threads) state.synced.targets.set(name, synced);
            }
            state.channels.push(tasks);
            joined();
            pair(thread);
            host.placed();
            show(thread, "joined");
        });
        if (hasWaitAsync()) void listen(thread);
    };
    /** Returns a thread's control words to the memory, once it left: a thread that died may still be writing them. */
    const free = (thread: Joined): void => {
        const block = controlBlocks.get(thread);
        if (block === undefined) return;
        memory.free(block, controlBytes + lineWords * 4);
        controlBlocks.delete(thread);
        thread.control = null;
    };

    /**
     * Disconnected, dead or refused: its status `"gone"`, its claims released, its objects back here between runs, and
     * its observers stopped. Its log is freed once it `left`: a thread that died may still be reading it.
     */
    const gone = (thread: Joined, left = false): void => {
        if (thread.status === "gone") return;
        const { control, log, tasks } = thread;
        thread.status = "gone";
        threads.delete(thread);
        byNumber.delete(thread.number);
        // Its channels close; runs whose input moved to it can't run, and reject.
        for (const peer of thread.peers) {
            peer.peers.delete(thread);
            if (peer.status === "joined") post(peer, { protocol: protocolName, kind: "unpeer", thread: thread.number });
        }
        thread.peers.clear();
        if (!closed) for (const other of threads) drain(other);
        for (const name of thread.claims) if (claimed.get(name) === thread) claimed.delete(name);
        // A task in flight settles now, its systems skipped with a "thread" failure; they're placed here between runs.
        tasks?.end();
        // Its synced systems' posts settle, its own forgotten, those on the threads it claimed placed here again.
        const { synced } = thread;
        if (synced !== null) {
            for (const [name, target] of [...state.synced.targets]) if (target === synced) state.synced.targets.delete(name);
            endTarget(state, synced, left);
            for (const proxy of thread.proxies.values()) host.synced.drop(proxy);
            thread.proxies.clear();
        }
        if (log !== null) host.between(() => {
            // Indexes its finalizers held return, and stops it never acknowledged are reported.
            if (tasks !== null) state.unplaced.push(...endStops(tasks.stops, state.holds, state.entities.released, thread.claims.join(`" and "`)));
            releaseThreads(state, log);
            if (tasks !== null) {
                for (const [name, channel] of [...state.threadTasks]) if (channel === tasks) state.threadTasks.delete(name);
                state.channels.splice(state.channels.indexOf(tasks), 1);
                host.placed();
                if (left) tasks.free();
            }
            if (left) freeMoveLog(log);
            show(thread, "gone");
        });
        else if (!closed) show(thread, "gone");
        for (const observer of [...thread.watching.keys()]) unobserve(thread, observer);
        if (control !== null) Atomics.notify(control, postedWord);
        thread.abort.abort();
    };

    const receive = (thread: Joined, message: ToWorld): void => {
        switch (message.kind) {
            case "join": return join(thread, message.threads, message.waits, message.lock, message.imported);
            case "completed": return thread.tasks?.completed(message);
            case "unplaced": return thread.tasks?.unplaced(message.indexes);
            case "finalized": {
                const { tasks } = thread;
                if (tasks === null) return;
                for (const [index, error] of message.errors) {
                    const finalizer = tasks.finalizerAt(index);
                    if (finalizer !== undefined) host.defer(failureOf("finalizer", labelOfItem(finalizer), Object.assign(new Error(error.message), { name: error.name, stack: error.stack })));
                }
                return;
            }
            case "name": {
                const found = message.item ? itemOfId(message.id) : keyOfId(message.id);
                const value = found === undefined ? null : typeof found === "symbol" ? found : definitionOf(found) ?? null;
                thread.names.set(message.number, { id: message.id, value });
                return drain(thread);
            }
            case "input": {
                thread.inputs.set(message.sequence, message.input);
                return drain(thread);
            }
            case "received": {
                const from = byNumber.get(message.from);
                // The run's thread is gone: its input is of no use.
                if (from === undefined) return post(thread, { protocol: protocolName, kind: "release", from: message.from, sequence: message.sequence });
                from.moved.set(message.sequence, thread);
                return drain(from);
            }
            case "synced": return declare(thread, message.number, message.name, message.declaration, message.added);
            case "synced add":
            case "synced remove":
            case "synced drop": {
                const proxy = thread.proxies.get(message.number);
                if (proxy === undefined) return;
                if (message.kind === "synced add") return host.synced.add(proxy);
                if (message.kind === "synced remove") return host.synced.remove(proxy);
                thread.proxies.delete(message.number);
                thread.names.delete(message.number);
                return host.synced.drop(proxy);
            }
            case "synced failed": {
                for (const [index, error] of message.errors) {
                    const placed = thread.synced?.placed[index];
                    if (placed !== undefined) host.defer(failureOf("system", placed.label, Object.assign(new Error(error.message), { name: error.name, stack: error.stack })));
                }
                return;
            }
            case "synced dropped": return thread.synced === null ? undefined : droppedSynced(state, thread.synced, message.indexes);
            case "synced again": return state.synced.again?.();
            case "observe": return observe(thread, message.observer, message.subscription);
            case "unobserve": return unobserve(thread, message.observer);
            case "wake": return drain(thread);
            case "leave": {
                gone(thread, true);
                return free(thread);
            }
        }
    };

    /** Lets a thread join through `port`: `"joining"`, with no claims. */
    const share = (port: Parameters<World["share"]>[0]): void => {
        const thread: Joined = {
            channel: threadChannel<ToJoined, ToWorld>(port), status: "joining", claims: [], control: null, views: [], waits: true,
            names: new Map(), next: 1, completed: 0, finished: new Set(), inputs: new Map(), moved: new Map(), peers: new Set(), watching: new Map(), woken: false,
            abort: new AbortController(), log: null, number: ++numbered, imported: new Set(), tasks: null, synced: null, proxies: new Map(),
        };
        threads.add(thread);
        byNumber.set(thread.number, thread);
        show(thread, "joining");
        thread.channel.onMessage(message => { if (thread.status !== "gone" || message.kind === "leave") receive(thread, message); });
        thread.channel.onClose(() => gone(thread));
    };

    /**
     * A joined thread's own synced system, declared by its number for it: the world's value standing for it, which
     * runs on that thread, with the keys and indexes it names by id; a run of that number runs it. One the world can't
     * declare, naming a key or index it never imported, is a failure in the next run's report.
     */
    /** Indexes made for joined threads' synced systems from declarations without ids, by what they declare, kept while the world lives. */
    const madeIndexes = new Map<string, ReturnType<typeof indexDefinitionOf>>();
    /** An index like one a joined thread declared without an id: one per declaration, for every thread. */
    const madeIndex = (thread: Joined, declared: SyncedIndex): ReturnType<typeof indexDefinitionOf> => {
        const keys = (numbers: readonly number[]): Key[] => numbers.map(each => keyOf(thread, each));
        const key = keys(declared.key);
        const has = keys(declared.has);
        const not = keys(declared.not);
        const ids = (list: readonly Key[]): string => list.map(each => idOf(state, each)).join(",");
        const identity = `${ids(key)}|${ids(has)}|${ids(not)}|${declared.sorted ? "s" : ""}${declared.unique ? "u" : ""}`;
        let index = madeIndexes.get(identity);
        if (index === undefined) {
            // `Index.create` checks the declaration as the joined thread's was checked.
            index = indexDefinitionOf(Reflect.apply(Index.create, undefined, [{ name: declared.name, key, sorted: declared.sorted, unique: declared.unique, components: { has, not } }]));
            madeIndexes.set(identity, index);
        }
        return index;
    };

    const declare = (thread: Joined, number: number, name: string, declared: SyncedDeclaration, added: boolean): void => {
        const target = thread.synced;
        if (target === null) return;
        let proxy: Leaf;
        try {
            const keys = (numbers: readonly number[]): Key[] => numbers.map(each => keyOf(thread, each));
            /** The lists given, of keys, leaving out empty ones but a lookup's `changed`, which chooses its row's form. */
            const listed = (entries: readonly (readonly [string, readonly number[] | null])[]): { [field: string]: Key[] } => {
                const result: { [field: string]: Key[] } = {};
                for (const [field, numbers] of entries) if (numbers !== null && (numbers.length > 0 || field === "changed")) result[field] = keys(numbers);
                return result;
            };
            const lookup: { [name: string]: object } = {};
            for (const each of declared.lookup) {
                if (each.index === null) {
                    lookup[each.name] = listed([["read", each.read], ["has", each.has], ["not", each.not], ["changed", each.changed]]);
                    continue;
                }
                const index = typeof each.index === "string" ? indexDefinitionOf(itemOfId(each.index)) : madeIndex(thread, each.index);
                if (index === undefined) throw new Error(`A joined thread's synced system looks up through index "${String(each.index)}", which this world never imported.`);
                lookup[each.name] = { index, ...listed([["read", each.read], ["changed", each.changed]]) };
            }
            const { components, resources } = declared;
            // Unnamed, so other systems' labels stay as they are; its own is the thread's.
            const declaration = {
                synced: true,
                ...components === null ? {} : { components: listed([["read", components.read], ["has", components.has], ["not", components.not], ["added", components.added], ["changed", components.changed]]) },
                ...resources === null ? {} : { resources: listed([["read", resources.read], ["changed", resources.changed], ["is", resources.is], ["not", resources.not]]) },
                ...declared.lookup.length === 0 ? {} : { lookup },
            };
            // `System.create` checks the declaration as the joined thread's was checked; its body runs only there.
            const created = requireDefinition(Reflect.apply(System.create, undefined, [declaration, () => {}]));
            if (created.kind === "composite") return;
            proxy = created;
        }
        catch (error) {
            host.defer(failureOf("system", name, error));
            // Its runs reject.
            thread.names.set(number, { id: `#synced:${number}`, value: null });
            drain(thread);
            return;
        }
        state.synced.proxies.set(proxy, { target, local: number, label: name });
        thread.proxies.set(number, proxy);
        thread.names.set(number, { id: `#synced:${number}`, value: proxy });
        if (added) host.synced.add(proxy);
        drain(thread);
    };

    /** At the world's dispose: joined threads hear of it, and their observers stop. */
    const close = (): void => {
        closed = true;
        for (const thread of [...threads]) {
            post(thread, { protocol: protocolName, kind: "disposed" });
            gone(thread);
            thread.channel.close();
        }
    };

    return { share, close, progress: observeProgress };
};
