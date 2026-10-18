import type { Entity } from '../../interface/entity/entity.js';
import type { Port } from '../../interface/world/join.js';
import type { Failure, Report } from '../../interface/world/report.js';
import { threadClaims } from '../../interface/components/thread-claims.js';
import { threadStatus } from '../../interface/components/thread-status.js';
import { definitionOf, firstKeyOf, itemOfId, keyOfId, labelOf, type Definition } from '../../interface/registry/index.js';
import type { Layout, Views } from '../../interface/registry/layout.js';
import { addCommand, createBuffer, spawnCommand, type CommandBuffer } from './buffer.js';
import { pushValues } from './commands.js';
import { asEntity, reserve } from './entities.js';
import { failureOf } from './failures.js';
import {
    clean, completedWord, controlBytes, inputByMessage, inputLayoutOf, platformLocks, postedWord, protocolName, rejected, reported, runSlots,
    signalWord, unreadWord, slotInput, slotNumber, slotStatus, slotViews, slotWords, slotsWord, threadChannel, unposted,
    type Subscription, type ThreadChannel, type ToJoined, type ToWorld,
} from './joining.js';
import { alignFor, createMailbox, entityPlanOf, freeMailbox, publishSlot, writeSlot, writeValue, type MailboxWriter } from './mailbox.js';
import { lineWords } from './protocol.js';
import type { EntityOptions, QueryOptions } from './reads.js';
import { idOf, type Key, type State } from './state.js';

type Notify = (value: unknown) => void;
type Subscribe = (notify: Notify) => () => void;

/** What sharing needs of the world. */
export type SharingHost = {
    readonly state: State;
    /** Runs a system as `world.run` does. */
    readonly run: (definition: Definition, input: unknown) => Promise<Report>;
    readonly observers: {
        readonly resource: (key: Key) => Subscribe;
        readonly entity: (entity: Entity, options: EntityOptions | undefined) => Subscribe;
        readonly query: (options: QueryOptions, counting: boolean) => Subscribe;
    };
    /** Queues the world's own changes to a thread's entity for the next sync point, and makes it due. */
    readonly change: (buffer: CommandBuffer) => void;
    /** A failure for the next run's report, as an observer's first value given through the queue is. */
    readonly defer: (failure: Failure) => void;
};

/** A number a joined thread gave a key or system, with its id, and what the id names here, or null for nothing. */
type Named = { readonly id: string; readonly value: Key | Definition | null };

/** A joined thread's observer: what stops the world's observer, and its mailbox. */
type Watching = { readonly stop: () => void; readonly mailbox: MailboxWriter };

/** A thread that joined, or is joining, through a port this world shared. */
type Joined = {
    readonly entity: Entity;
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
    readonly watching: Map<number, Watching>;
    /** Whether a wake is queued for it. */
    woken: boolean;
    /** Ends the world's request for its lock. */
    readonly abort: AbortController;
};

const hasWaitAsync = (): boolean => typeof Atomics.waitAsync === "function";

const isClean = (report: Report): boolean => report.failures.length === 0 && report.skipped.length === 0 && report.dropped === 0;

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

/**
 * The world's side of joined threads: `share` reserves a thread's entity and stages its spawn, then its handshake
 * records its claims, which a thread claimed twice can't join. Runs come through its slots in shared memory, in
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

    const post = (thread: Joined, message: ToJoined): void => thread.channel.post(message);

    const change = (thread: Joined, kind: number, values: object): void => {
        const buffer = createBuffer();
        pushValues(state, buffer, kind, thread.entity, values);
        host.change(buffer);
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
            thread.next++;
            const input = bytes === inputByMessage ? thread.inputs.get(sequence) : undefined;
            thread.inputs.delete(sequence);
            const definition = typeof named.value === "object" && named.value !== null ? named.value : null;
            if (definition === null) {
                reject(thread, sequence, `System "${named.id}" isn't one this world imported, so it can't run here.`);
                continue;
            }
            const layout = bytes >= 0 && definition.kind !== "composite" ? inputLayoutOf(definition, definition.declaration.input) : null;
            const value = layout !== null && layout.kind === "linear" ? layout.read(thread.views[slot], 0) : input;
            let ran: Promise<Report>;
            try {
                ran = host.run(definition, value);
            }
            catch (error) {
                reject(thread, sequence, messageOf(error));
                continue;
            }
            ran.then(
                report => isClean(report) ? finish(thread, sequence, clean, null) : finish(thread, sequence, reported, { protocol: protocolName, kind: "report", sequence, report }),
                error => reject(thread, sequence, messageOf(error)),
            );
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

    const layoutOfKey = (key: Key, what: string): Layout => {
        const layout = state.layouts[idOf(state, key)];
        if (layout.kind === "object") throw new Error(`${what} reads "${labelOf(key)}", an object, which another thread can't read.`);
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
                const layout = layoutOfKey(key, "An observer");
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
                const layouts = keys.map(key => layoutOfKey(key, "An observer"));
                const plan = entityPlanOf(layouts);
                return host.observers.entity(asEntity(subscription.entity), { required, optional })(observed => {
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
                return host.observers.entity(asEntity(subscription.entity), undefined)(observed => {
                    const value = typeof observed === "object" ? observed : null;
                    listed.length = 0;
                    if (value !== null) for (const key of Object.getOwnPropertySymbols(value)) {
                        const number = numbers.get(firstKeyOf(key));
                        const layout = state.layouts[idOf(state, key)];
                        if (number !== undefined && layout.kind !== "object") listed.push({ number, layout, value: Reflect.get(value, key) });
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
                    layoutOfKey(key, "A query's where");
                    where[key] = value;
                }
                const order: { [key: Key]: boolean } = {};
                for (const [number, ascending] of subscription.order) {
                    const key = keyOf(thread, number);
                    layoutOfKey(key, "A query's order");
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
        // Posted first, so the thread knows the mailbox before its first value's wake.
        post(thread, { protocol: protocolName, kind: "mailbox", observer, offset: mailbox.offset });
        try {
            thread.watching.set(observer, { stop: subscribe(thread, mailbox, subscription), mailbox });
        }
        catch (error) {
            freeMailbox(mailbox);
            host.defer(failureOf("observer", `a joined thread's observer #${observer}`, error));
        }
    };

    const unobserve = (thread: Joined, observer: number): void => {
        const watching = thread.watching.get(observer);
        if (watching === undefined) return;
        thread.watching.delete(observer);
        watching.stop();
        freeMailbox(watching.mailbox);
    };

    /** Its claims checked against those already made, its control words placed, and its status `"joined"`; or refused. */
    const join = (thread: Joined, threads: readonly string[], waits: boolean, lock: string | null): void => {
        if (thread.status !== "joining") return;
        const locks = platformLocks();
        // Granted once the thread no longer holds it: it left, or ended.
        if (lock !== null && locks !== null) locks.request(lock, { signal: thread.abort.signal }, () => gone(thread)).catch(() => {});
        const twice = threads.find((name, at) => name === "world" || threads.indexOf(name) < at || claimed.has(name));
        if (twice !== undefined) {
            const message = twice === "world" ? `A joined thread can't claim "world", the world's own thread.` : `Thread "${twice}" is claimed twice.`;
            post(thread, { protocol: protocolName, kind: "refused", message });
            gone(thread);
            return;
        }
        for (const name of threads) claimed.set(name, thread);
        thread.claims = threads;
        thread.waits = waits;
        const offset = memory.allocate(controlBytes + lineWords * 4);
        const start = Math.ceil(offset / (lineWords * 4)) * lineWords * 4;
        thread.control = new Int32Array(memory.memory.buffer, start, controlBytes / 4).fill(0);
        controlBlocks.set(thread, offset);
        thread.views = slotViews(memory.memory.buffer, start);
        thread.status = "joined";
        post(thread, { protocol: protocolName, kind: "joined", memory: memory.memory, control: start, waits: hasWaitAsync() });
        change(thread, addCommand, { [threadStatus]: "joined", [threadClaims]: threads });
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

    /** Disconnected, dead or refused: its status `"gone"`, its claims released and its observers stopped. */
    const gone = (thread: Joined): void => {
        if (thread.status === "gone") return;
        const { control } = thread;
        thread.status = "gone";
        threads.delete(thread);
        for (const name of thread.claims) if (claimed.get(name) === thread) claimed.delete(name);
        for (const observer of [...thread.watching.keys()]) unobserve(thread, observer);
        if (control !== null) Atomics.notify(control, postedWord);
        thread.abort.abort();
        if (!closed) change(thread, addCommand, { [threadStatus]: "gone" });
    };

    const receive = (thread: Joined, message: ToWorld): void => {
        switch (message.kind) {
            case "join": return join(thread, message.threads, message.waits, message.lock);
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
            case "observe": return observe(thread, message.observer, message.subscription);
            case "unobserve": return unobserve(thread, message.observer);
            case "wake": return drain(thread);
            case "leave": {
                gone(thread);
                return free(thread);
            }
        }
    };

    /**
     * Lets a thread join through `port`: reserves its entity and stages its spawn, `"joining"` with no claims, for the
     * next sync point, which it makes due.
     */
    const share = (port: Port): Entity => {
        const entity = reserve(state.entities);
        const thread: Joined = {
            entity, channel: threadChannel<ToJoined, ToWorld>(port), status: "joining", claims: [], control: null, views: [], waits: true,
            names: new Map(), next: 1, completed: 0, finished: new Set(), inputs: new Map(), watching: new Map(), woken: false,
            abort: new AbortController(),
        };
        threads.add(thread);
        change(thread, spawnCommand, { [threadStatus]: "joining", [threadClaims]: [] });
        thread.channel.onMessage(message => { if (thread.status !== "gone" || message.kind === "leave") receive(thread, message); });
        thread.channel.onClose(() => gone(thread));
        return entity;
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

    return { share, close };
};
