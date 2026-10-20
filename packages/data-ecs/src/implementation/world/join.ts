import type { Entity } from '../../interface/entity/entity.js';
import type { Observe } from '../../interface/observe/observe.js';
import type { Resource } from '../../interface/resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import type { Thread } from '../../interface/thread/thread.js';
import type { Report } from '../../interface/world/report.js';
import type { World } from '../../interface/world/world.js';
import { declarationOf, firstKeyOf, identifiedItems, idOfItem, idOfKey, identifiedKeys, indexOfLookup, keyOfId, kindOf, labelOf, labelOfItem, requireDefinition, threadOf, threadOfDeclaration, type Definition } from '../../interface/registry/index.js';
import { layoutOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { asEntity } from './entities.js';
import {
    clean, completedWord, fitsInline, inputByMessage, inputLayoutOf, inputMoved, noInput, pending, platformLocks, postedWord, protocolName, runSlots, signalWord, unposted, unreadWord,
    slotInput, slotNumber, slotPayload, slotSequence, slotStatus, slotViews, slotWords, slotsWord, threadChannel, type Subscription, type SyncedDeclaration, type SyncedLookup, type ThreadChannel, type ToJoined, type ToPeer, type ToWorld,
} from './joining.js';
import { entityPlanOf, hasFresh, mailboxReader, readSlot, readValue, type MailboxReader } from './mailbox.js';
import { currentBuffer, sharedMemoryAvailable } from './memory.js';
import { logRunWord } from './move-log.js';
import { componentsAt, createMirror, locate, nameComponent, objectAt, rebuild, replay, waitDelivered, waitStructure, type Location, type Mirror } from './mirror.js';
import { defaultOf } from './state.js';
import { createThreadSystems, type SystemSetup } from './thread-systems.js';
import { taskBlockWords } from './thread-tasks.js';
import { createThreadDirectory } from './thread-directory.js';
import { createThreadSynced, resultOf, type Local } from './thread-synced.js';
import type { Leaf } from '../../interface/system/leaf.js';
import type { Failure } from '../../interface/world/report.js';
import { isSynced, scheduleOf } from '../../interface/registry/schedule.js';
import { releaseInput, transferablesOf } from './transfers.js';
import type { EntityOptions, QueryOptions } from './reads.js';

type Notify = (value: unknown) => void;

/** Shared by every clean report: read-only, so none needs its own. */
const none: readonly never[] = [];
const cleanReport: Report = { failures: none, skipped: none, dropped: 0, warnings: none };

/** What a run of a synced system of this thread's own gave when no post ran it, its system removed first. */
const noResult = { failure: null };

/** A report with a synced system's failure, or as it is. */
const withFailure = (report: Report, result: { readonly failure: Failure | null } | null): Report =>
    result === null || result.failure === null ? report : { ...report, failures: [...report.failures, result.failure] };

/** The reports of runs of several synced systems, as one. */
const mergeReports = (reports: readonly Report[]): Report => reports.reduce((all, report) => ({
    failures: [...all.failures, ...report.failures], skipped: [...all.skipped, ...report.skipped], dropped: all.dropped + report.dropped, warnings: [...all.warnings, ...report.warnings],
}), cleanReport);

/** A synced system's leaves: itself, or a composite's members when they're all synced; null for any other system. */
const syncedLeavesOf = (definition: Definition): readonly Leaf[] | null => {
    if (isSynced(definition)) return [definition];
    if (definition.kind !== "composite") return null;
    const schedule = scheduleOf(definition);
    return schedule.tiers.length === 0 && schedule.synced.length > 0 ? schedule.synced : null;
};

/** A run not yet settled: how to settle it, and its report or rejection once posted. */
type Run = { readonly resolve: (report: Report) => void; readonly reject: (error: unknown) => void; message: ToJoined | null; error: unknown; readonly local: Local | null };

/** A run waiting for a free slot, or for the thread to have joined. */
type Waiting = { readonly sequence: number; readonly number: number; readonly definition: Definition; readonly input: unknown };

/** What a decode gives for a value it can't read yet, with this thread's objects, and for one a newer will replace. */
const later = Symbol("later");
const stale = Symbol("stale");

/**
 * An observer on this thread: its mailbox once the world placed it, how a value is read from a slot, and a slot held
 * until this thread's objects in it can be read.
 */
type Observer = {
    readonly notify: Notify;
    reader: MailboxReader | null;
    readonly decode: (views: Views) => unknown;
    active: boolean;
    held: Views | null;
    /** Whether it reads this thread's objects, so its value holds only while no newer one waits. */
    readonly objects: boolean;
};

const hasWaitAsync = (): boolean => typeof Atomics.waitAsync === "function";

/** How long a joined thread spins for the world's next task after finishing one: about one wake-up's latency. */
const taskSpinMilliseconds = 0.02;

/** The most a joined thread works without returning to its event loop, where it can't be cut short: a task. */
const busyMilliseconds = 2;

/** A turn's timeout in node: as short as it can be while still resolving as a task. */
const turnMilliseconds = 0.001;

/**
 * Resolves on a later turn of this thread's event loop, once what was due there ran, timers included, at about a
 * microsecond's cost: in a browser a message to itself, a task as a timer's is; in node, whose messages a turn can
 * deliver without running timers, a wait on a word of its own that times out at once, which resolves as a task, where
 * a browser's would take at least a millisecond.
 */
const createTurn = (): (() => Promise<void>) => {
    if (globalThis.process?.versions?.node !== undefined) {
        const word = new Int32Array(new SharedArrayBuffer(4));
        return async () => {
            const waited = Atomics.waitAsync(word, 0, 0, turnMilliseconds);
            if (waited.async) await waited.value;
        };
    }
    const { port1, port2 } = new MessageChannel();
    const waiting: (() => void)[] = [];
    port1.onmessage = () => waiting.shift()?.();
    return () => new Promise(resolve => {
        waiting.push(resolve);
        port2.postMessage(null);
    });
};

/** Whether a key's values are objects of one of `claims`, which this thread fills. */
const ownObject = (key: symbol, claims: ReadonlySet<string>): boolean => {
    const declaration = declarationOf(key);
    const thread = declaration === undefined ? null : threadOfDeclaration(declaration);
    return thread !== null && claims.has(thread);
};

/**
 * A key's layout, for an observer reading its values. Throws for one holding objects, unless `claims`, the threads
 * this thread fills, has its thread: an entity observer reads this thread's own objects here.
 */
const readableLayout = (key: symbol, claims: ReadonlySet<string> = new Set()): Layout => {
    const layout = layoutOf(declarationOf(key)?.type);
    if (layout.kind === "object" && !ownObject(key, claims)) throw new Error(`An observer on a joined thread reads "${labelOf(key)}", an object, which lives on another thread.`);
    return layout;
};

/** A key, which is a symbol. */
const symbolOf = (key: unknown): symbol => {
    if (typeof key !== "symbol") throw new Error(`"${labelOf(key)}" isn't a key: a key is a symbol.`);
    return key;
};

/** Lets a node `MessagePort` close without keeping its thread alive: another joined thread's channel is no reason to. */
const unref = (port: object): void => {
    const method: unknown = Reflect.get(port, "unref");
    if (typeof method === "function") Reflect.apply(method, port, []);
};

/** The logical thread a system runs on when a joined thread claims it, by its objects; null for one that runs on `world`. */
const placements = new WeakMap<Definition, string | null>();
const placementOf = (definition: Definition): string | null => {
    let thread = placements.get(definition);
    if (thread !== undefined) return thread;
    thread = null;
    // Render systems and GPU kernels run with the world's device; a composite's members, wherever the world runs them.
    if (definition.kind === "system" && definition.declaration.kernel !== "gpu") {
        try {
            thread = threadOf(definition.declaration, "System", definition.name);
        }
        catch {
            thread = null;
        }
    }
    placements.set(definition, thread);
    return thread;
};

/** For tests: how many joined threads a joined world has a channel to, to move runs' inputs through. */
export const peersOf = new WeakMap<World, () => number>();

/** For tests of what a thread holds: how many of the systems the world placed on a joined thread it keeps. */
export const tablesOf = new WeakMap<World, () => { readonly systems: number; readonly synced: number }>();

/** Reports an error thrown by an observer's notify, as an event listener's would be. */
const rethrow = (error: unknown): void => queueMicrotask(() => { throw error; });

/**
 * Joins, through `port`, the world another thread shared through the other end, once this thread has imported the
 * modules of the systems it runs and the keys it observes, claiming `threads`, the logical threads it fills, the
 * world's own aside; none by default. Runs and observers work as on the world's thread, by the ids the build gives
 * top-level systems and keys: a run of a system without one, or one the world never imported, rejects. An observer's
 * first value always comes later, and one that falls behind gets the newest value; observers read structs only, and an
 * entity's whole value is its struct components. `dispose` disconnects this thread. Throws where memory can't be
 * shared, as without cross-origin isolation.
 *
 * Runs go through this thread's slots in shared memory and complete through its completed word, and observers read
 * their mailboxes, waiting on its signal word without blocking while any run or observer is active.
 */
export const joinWorld = (port: Parameters<World["share"]>[0], options: { readonly threads?: readonly Exclude<Thread, "world">[] } = {}): World => {
    if (!sharedMemoryAvailable()) throw new Error("Without cross-origin isolation memory can't be shared, so no thread can join.");
    const channel = threadChannel<ToWorld, ToJoined>(port);
    /** Messages posted before the join message is, which waits for this thread's lock. */
    let held: ToWorld[] | null = [];
    const post = (message: ToWorld, transfer?: readonly object[]): void => {
        if (held === null) channel.post(message, transfer);
        else held.push(message);
    };

    /** This thread's number, as the world gave it. */
    let own = 0;
    /** Channels to other joined threads, by number, with the threads each claims; and those threads' joined threads. */
    const peers = new Map<number, { readonly channel: ThreadChannel<ToPeer, ToPeer>; readonly threads: readonly string[] }>();
    const fillers = new Map<string, number>();
    /** Inputs moved here, by the number of the joined thread whose run they're of, then by that run's sequence. */
    const received = new Map<number, Map<number, unknown>>();
    const keep = (from: number, sequence: number, input: unknown): void => {
        let runs = received.get(from);
        if (runs === undefined) received.set(from, runs = new Map());
        runs.set(sequence, input);
    };
    /** Takes a moved input, once: undefined once a task took it. */
    const take = (from: number, sequence: number): unknown => {
        const runs = received.get(from);
        const input = runs?.get(sequence);
        runs?.delete(sequence);
        return input;
    };
    /** Where a run's moved input goes: the joined thread, this one included, filling its system's thread; null for the world's. */
    const destinationOf = (definition: Definition): number | null => {
        const thread = placementOf(definition);
        if (thread === null) return null;
        if (claims.has(thread)) return own;
        return fillers.get(thread) ?? null;
    };
    const unpeer = (thread: number): void => {
        const peer = peers.get(thread);
        if (peer === undefined) return;
        peers.delete(thread);
        peer.channel.close();
        for (const name of peer.threads) if (fillers.get(name) === thread) fillers.delete(name);
    };

    /** This thread's numbers, by id, for the keys and systems it names; each id is posted once. */
    const numbers = new Map<string, number>();
    const keys: symbol[] = [];
    const numberOf = (id: string, item: boolean, key: symbol | null): number => {
        const known = numbers.get(id);
        if (known !== undefined) return known;
        const number = numbers.size;
        numbers.set(id, number);
        if (key !== null) keys[number] = key;
        post({ protocol: protocolName, kind: "name", number, id, item });
        return number;
    };
    const keyNumber = (key: unknown): number => {
        const symbol = symbolOf(key);
        const id = idOfKey(symbol);
        if (id === undefined) throw new Error(`"${labelOf(symbol)}" has no id, so another thread can't name it; the build gives top-level keys one.`);
        return numberOf(id, false, symbol);
    };

    const claims: ReadonlySet<string> = new Set(options.threads ?? []);
    /** This thread's objects, following the world's rows, once it joined with claims; and its components' keys by the world's numbers. */
    let mirror: Mirror | null = null;
    const named = new Map<number, symbol | null>();
    const components = new Map<symbol, number>();
    let structureWaited = false;
    let deliveryWaited = false;
    /** The systems the world places on this thread, once it joined with claims; setups that came before. */
    let systems: ReturnType<typeof createThreadSystems> | null = null;
    /** Synced systems placed on this thread, once it joined. */
    let synced: ReturnType<typeof createThreadSynced> | null = null;
    const setups: SystemSetup[] = [];
    const finalizerSetups: SystemSetup[] = [];

    let memory: WebAssembly.Memory | null = null;
    let control: Int32Array | null = null;
    let views: readonly Views[] = [];
    let worldWaits = true;
    /** Why runs reject: the world refused this thread, was disposed, or this thread left. */
    let failure: Error | null = null;

    let sequence = 0;
    /** Runs settled, in order, through the completed word. */
    let settled = 0;
    let completed = 0;
    const runs = new Map<number, Run>();
    const waiting: Waiting[] = [];
    let last: Promise<unknown> = Promise.resolve();
    let left = false;

    let observerCount = 0;
    const observers = new Map<number, Observer>();

    const write = ({ sequence, number, definition, input }: Waiting): void => {
        if (control === null) return;
        const slot = (sequence - 1) % runSlots;
        const base = slotsWord + slot * slotWords;
        control[base + slotStatus] = pending;
        control[base + slotNumber] = number;
        control[base + slotSequence] = sequence;
        const schema = definition.kind === "composite" ? undefined : definition.declaration.input;
        const layout = fitsInline(schema, input) ? inputLayoutOf(definition, schema) : null;
        if (layout !== null && layout.kind === "linear") {
            layout.write(views[slot], 0, input);
            control[base + slotInput] = layout.stride;
        }
        else if (input === undefined) control[base + slotInput] = noInput;
        else {
            try {
                // Transferable values move to the thread the system runs on: through the world's, or straight to the
                // joined thread filling it, which tells the world once they're there.
                const transfer = transferablesOf(input);
                const destination = transfer === null ? null : destinationOf(definition);
                if (destination === null) {
                    post({ protocol: protocolName, kind: "input", sequence, input }, transfer ?? undefined);
                    control[base + slotInput] = inputByMessage;
                }
                else {
                    if (destination === own) keep(own, sequence, input);
                    else peers.get(destination)?.channel.post({ protocol: protocolName, kind: "transfer", sequence, input }, transfer ?? undefined);
                    control[base + slotPayload] = destination;
                    control[base + slotInput] = inputMoved;
                }
            }
            catch (error) {
                // An input that can't be posted, as one holding a function: the world completes the run without running it.
                const run = runs.get(sequence);
                if (run !== undefined) run.error = error;
                control[base + slotNumber] = unposted;
                control[base + slotInput] = noInput;
            }
        }
        Atomics.store(control, postedWord, sequence);
        Atomics.notify(control, postedWord);
        if (!worldWaits) post({ protocol: protocolName, kind: "wake" });
    };

    /** Writes waiting runs while their slots are free, in order. */
    const writeWaiting = (): void => {
        let written = 0;
        while (written < waiting.length && control !== null && waiting[written].sequence - completed <= runSlots) write(waiting[written++]);
        if (written > 0) waiting.splice(0, written);
    };

    /** Settles runs the world completed, in order: a clean one at once, any other once its report or rejection arrived. */
    const settle = (): void => {
        while (settled < completed && control !== null) {
            const next = settled + 1;
            const run = runs.get(next);
            const status = control[slotsWord + ((next - 1) % runSlots) * slotWords + slotStatus];
            if (run !== undefined && status !== clean && run.message === null) return;
            // A run of this thread's own synced system settles once a post for it ran here, unless it was removed since.
            const result = run === undefined || run.local === null ? null : resultOf(run.local, next) ?? (run.local.stopped >= next ? noResult : undefined);
            if (result === undefined) return;
            settled = next;
            runs.delete(next);
            if (run === undefined) continue;
            const { message } = run;
            if (run.error !== undefined) run.reject(run.error);
            else if (message === null) run.resolve(withFailure(cleanReport, result));
            else if (message.kind === "report") run.resolve(withFailure(message.report, result));
            else if (message.kind === "rejected") run.reject(new Error(message.message));
        }
    };

    /** Evaluates observers again once observers were delivered through the sync this thread's objects are at. */
    const waitForDelivery = (): void => {
        if (deliveryWaited || mirror === null) return;
        deliveryWaited = true;
        void waitDelivered(mirror).then(() => {
            deliveryWaited = false;
            processObservers();
        });
    };

    /** Evaluates observers again once the structure epoch turns even: a sync point applied while one read. */
    const waitForStructure = (): void => {
        if (structureWaited || mirror === null) return;
        structureWaited = true;
        void waitStructure(mirror).then(() => {
            structureWaited = false;
            processObservers();
        });
    };

    const processObservers = (): void => {
        if (memory === null || observers.size === 0) return;
        const buffer = memory.buffer;
        for (const observer of observers.values()) {
            const { reader } = observer;
            if (reader === null || !observer.active) continue;
            let value: unknown = stale;
            for (; ;) {
                const slot = readSlot(reader, buffer) ?? observer.held;
                if (slot === null) break;
                observer.held = null;
                try {
                    value = observer.decode(slot);
                }
                catch (error) {
                    rethrow(error);
                    value = stale;
                    break;
                }
                // Held, unread, until its objects can be read; a newer value replaces it.
                if (value === later) observer.held = slot;
                // Its objects are as of the sync observers were delivered through: only a value no newer one replaced
                // is as of that sync too.
                if (value === later || value === stale || !observer.objects || !hasFresh(reader)) break;
            }
            // The world gives the newer value it had when this thread's objects were read.
            if (value === later || value === stale) continue;
            try {
                observer.notify(value);
            }
            catch (error) {
                rethrow(error);
            }
        }
    };

    /**
     * Where an entity is, with this thread's objects as of the sync observers were delivered through; `later` while that
     * can't be read yet, evaluating observers again once it can.
     */
    const located = (entity: Entity): Location | null | typeof later => {
        if (mirror === null) return later;
        const location = locate(mirror, entity);
        if (location === "applying") waitForStructure();
        else if (location === "behind") waitForDelivery();
        return location === "applying" || location === "held" || location === "behind" ? later : location;
    };

    /** This thread's object of `key` at a location, or `later` while the world hasn't named its component yet. */
    const objectOf = (location: Location, key: symbol): { readonly held: boolean; readonly value: unknown } | typeof later => {
        const component = components.get(firstKeyOf(key));
        return mirror === null || component === undefined ? later : objectAt(mirror, location, component);
    };

    /** Names a component whose objects this thread fills, once its mirror exists. */
    const name = (component: number, key: symbol | null): void => {
        if (mirror === null) {
            named.set(component, key);
            return;
        }
        nameComponent(mirror, component, key, defaultOf);
        if (key !== null) components.set(firstKeyOf(key), component);
    };

    /** Whether the last `process` finished a task, so the next of a tick's tasks may follow it closely. */
    let tasked = false;
    const process = (): void => {
        if (control === null) return;
        Atomics.store(control, unreadWord, 0);
        // A task first: the world waits for it. Then finalizers of stops no task replayed.
        tasked = systems?.process() ?? false;
        systems?.finalize();
        if (synced !== null && synced.process() > 0) syncedRan = true;
        completed = Atomics.load(control, completedWord);
        settle();
        writeWaiting();
        processObservers();
    };

    let listening = false;
    const active = (): boolean => control !== null && failure === null && (runs.size > 0 || observers.size > 0 || systems !== null || synced?.active() === true);
    let turn: (() => Promise<void>) | null = null;
    /** The runs the world had finished when this thread last returned to its event loop, and when it did. */
    let turnedRun = 0;
    let turnedAt = 0;
    const runNow = (): number => mirror === null ? turnedRun : Atomics.load(mirror.header, logRunWord);
    /** Whether synced systems ran since this thread last returned to its event loop: each post follows a sync point. */
    let syncedRan = false;
    const turned = (): void => {
        turnedRun = runNow();
        turnedAt = performance.now();
        syncedRan = false;
    };
    /**
     * Whether to return to the event loop before going on: once a run's or tick's tiers finished since it last did,
     * which is after the tick's last task here, or after `busyMilliseconds`.
     */
    const due = (): boolean => syncedRan || runNow() !== turnedRun || performance.now() - turnedAt > busyMilliseconds;
    const nextTurn = async (): Promise<void> => {
        turn ??= createTurn();
        await turn();
        turned();
    };
    /**
     * Waits on the signal word without blocking while a run or observer is active, so a quiet thread does no work. It
     * returns to its event loop at least once a tick, so its timers, rendering and promises' callbacks run.
     */
    const listen = async (): Promise<void> => {
        if (listening || !hasWaitAsync()) return;
        listening = true;
        turned();
        try {
            while (active() && control !== null) {
                // Read before what's new, so a wake after it isn't missed.
                Atomics.store(control, unreadWord, 0);
                const seen = Atomics.load(control, signalWord);
                process();
                if (!active()) break;
                // A tick's next task follows its last closely: spin briefly before paying for a wait's wake-up, with a
                // turn of the event loop once the tick finished, as the world starts the next.
                if (tasked) {
                    let deadline = performance.now() + taskSpinMilliseconds;
                    while (Atomics.load(control, signalWord) === seen && performance.now() < deadline) {
                        if (!due()) continue;
                        await nextTurn();
                        deadline = performance.now() + taskSpinMilliseconds;
                    }
                }
                // A wake since this thread cleared the word may have notified no one, and the next wake won't notify
                // while the word says this thread hasn't read it, so it reads again rather than wait.
                if (Atomics.load(control, unreadWord) !== 0) {
                    if (due()) await nextTurn();
                    continue;
                }
                const waited = Atomics.waitAsync(control, signalWord, seen);
                if (waited.async) {
                    await waited.value;
                    turned();
                }
                else if (due()) await nextTurn();
            }
        }
        finally {
            listening = false;
        }
    };

    /** Rejects every run not yet settled, and every later one; releases inputs moved here, and closes channels to other threads. */
    const fail = (error: Error): void => {
        failure ??= error;
        for (const run of runs.values()) run.reject(failure);
        runs.clear();
        waiting.length = 0;
        for (const inputs of received.values()) for (const input of inputs.values()) releaseInput(input);
        received.clear();
        for (const thread of [...peers.keys()]) unpeer(thread);
        if (control !== null) Atomics.notify(control, signalWord);
    };

    channel.onMessage(message => {
        switch (message.kind) {
            case "joined": {
                memory = message.memory;
                own = message.thread;
                const buffer = currentBuffer(memory);
                control = new Int32Array(buffer, message.control, (slotsWord + runSlots * slotWords));
                views = slotViews(buffer, message.control);
                worldWaits = message.waits;
                if (message.log !== null) {
                    mirror = createMirror(memory, message.log, message.thread);
                    for (const [component, key] of named) name(component, key);
                    named.clear();
                }
                const directory = createThreadDirectory(memory, mirror);
                const replayed = mirror;
                synced = createThreadSynced({
                    directory, mirror, post: sent => channel.post(sent), localOf: number => localsByNumber.get(number)?.deref(),
                    current: () => {
                        if (replayed === null) return true;
                        const state = replay(replayed);
                        return state !== "held" && (state !== "lapped" || rebuild(replayed));
                    },
                });
                if (message.tasks !== null && mirror !== null) {
                    systems = createThreadSystems({
                        memory, mirror, directory, control: new Int32Array(buffer, message.tasks, taskBlockWords), claims, worldWaits: message.waits,
                        post: (sent, transfer) => channel.post(sent, transfer), keyNumber, numbered: () => numbers.size,
                    });
                    systems.setup(setups);
                    systems.setupFinalizers(finalizerSetups);
                    setups.length = finalizerSetups.length = 0;
                }
                writeWaiting();
                void listen();
                return;
            }
            case "refused": return fail(new Error(message.message));
            case "disposed": {
                // Its finalizers release what this thread holds, as the world's do.
                systems?.disposed();
                return fail(new Error("The world is disposed."));
            }
            case "report":
            case "rejected": {
                const run = runs.get(message.sequence);
                if (run !== undefined) run.message = message;
                return settle();
            }
            case "mailbox": {
                const observer = observers.get(message.observer);
                if (observer === undefined || memory === null) return;
                observer.reader = mailboxReader(currentBuffer(memory), message.offset);
                processObservers();
                void listen();
                return;
            }
            case "component": {
                // Its key here, if this thread has one, for a component of a thread it claims.
                const key = message.id === null ? undefined : keyOfId(message.id);
                name(message.component, key !== undefined && ownObject(key, claims) ? key : null);
                // A task waiting for this component's key runs now, and posts of synced systems.
                systems?.process();
                synced?.process();
                return processObservers();
            }
            case "systems": {
                if (systems === null) setups.push(...message.systems);
                else systems.setup(message.systems);
                return systems?.process();
            }
            case "unplace": {
                if (systems !== null) return systems.unplace(message.indexes, message.sequence);
                // Never set up, so nothing ran them.
                for (let k = setups.length - 1; k >= 0; k--) if (message.indexes.includes(setups[k].index)) setups.splice(k, 1);
                return post({ protocol: protocolName, kind: "unplaced", indexes: message.indexes });
            }
            case "finalizers": {
                if (systems === null) finalizerSetups.push(...message.finalizers);
                else systems.setupFinalizers(message.finalizers);
                // What waited for them goes on: stops, a task, synced systems, observers.
                systems?.finalize();
                systems?.process();
                synced?.process();
                return processObservers();
            }
            case "synced": {
                synced?.setup(message.systems);
                process();
                void listen();
                return;
            }
            case "unsynced": return synced?.unplace(message.indexes);
            case "task input": return systems?.input(message.sequence, message.held === undefined ? message.input : take(message.held[0], message.held[1]));
            case "release": return releaseInput(take(message.from, message.sequence));
            case "peer": {
                const from = message.thread;
                unpeer(from);
                const peer = threadChannel<ToPeer, ToPeer>(message.port);
                peers.set(from, { channel: peer, threads: message.threads });
                for (const name of message.threads) fillers.set(name, from);
                peer.onMessage(sent => {
                    if (sent.kind !== "transfer") return;
                    if (failure !== null) return releaseInput(sent.input);
                    keep(from, sent.sequence, sent.input);
                    post({ protocol: protocolName, kind: "received", from, sequence: sent.sequence });
                });
                unref(message.port);
                return;
            }
            case "unpeer": return unpeer(message.thread);
            case "wake": return process();
        }
    });
    // Held while this thread lives, so the world hears of its end however it ends: a browser worker ended from outside
    // its port reports nothing else.
    const locks = platformLocks();
    let release: (() => void) | null = null;
    const joinMessage = (lock: string | null): ToWorld => ({
        protocol: protocolName, kind: "join", threads: options.threads ?? [], waits: hasWaitAsync(), lock,
        imported: claims.size === 0 ? [] : [...identifiedItems("system"), ...identifiedItems("finalizer")],
    });
    const sendHeld = (lock: string | null): void => {
        const messages = held ?? [];
        held = null;
        channel.post(joinMessage(lock));
        for (const message of messages) channel.post(message);
    };
    if (locks === null) sendHeld(null);
    else {
        const lock = `${protocolName}#${globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)}`;
        void locks.request(lock, () => new Promise<void>(done => {
            release = done;
            sendHeld(lock);
        }));
    }

    /** This thread's own synced systems, by value and by its number for them, while they live; those added, by the value added. */
    const localsByLeaf = new WeakMap<Leaf, Local>();
    const localsByNumber = new Map<number, WeakRef<Local>>();
    const added = new Map<Definition, readonly Local[]>();
    const addedCounts = new Map<Local, number>();
    /** Tells the world a synced system of this thread's own is collected, so it forgets it. */
    const collected = new FinalizationRegistry<number>(number => {
        localsByNumber.delete(number);
        if (failure === null) post({ protocol: protocolName, kind: "synced drop", number });
    });

    /** What a synced system reads, for the world, by this thread's numbers; throws for what can't cross. */
    const describe = (leaf: Leaf): SyncedDeclaration => {
        const label = labelOfItem(leaf);
        const readable = (keys: readonly unknown[] | undefined): number[] => (keys ?? []).map(key => {
            const symbol = symbolOf(key);
            if (layoutOf(declarationOf(symbol)?.type).kind === "object" && !ownObject(symbol, claims)) {
                throw new Error(`Synced system "${label}" reads "${labelOf(symbol)}", an object, which lives on another thread than this joined one.`);
            }
            return keyNumber(symbol);
        });
        const present = (keys: readonly unknown[] | undefined): number[] => (keys ?? []).map(keyNumber);
        const { components, resources, lookup } = leaf.declaration;
        const lookups: SyncedLookup[] = [];
        for (const name of Object.keys(lookup ?? {})) {
            const declared = lookup?.[name];
            if (declared === undefined) continue;
            const index = indexOfLookup(declared);
            let indexId: string | null = null;
            if (index !== undefined) {
                indexId = idOfItem(index) ?? null;
                if (indexId === null) throw new Error(`Synced system "${label}" looks up through index "${labelOfItem(index)}", which has no id, so the world can't name it; the build gives top-level indexes one.`);
                const object = index.declaration.key.find(key => layoutOf(declarationOf(key)?.type).kind === "object");
                if (object !== undefined) throw new Error(`Synced system "${label}" looks up through index "${labelOfItem(index)}", whose key part "${labelOf(object)}" is an object, so it runs only on the world's thread.`);
                readable(index.declaration.key);
            }
            lookups.push({
                name, read: readable(declared.read), has: present("has" in declared ? declared.has : undefined), not: present("not" in declared ? declared.not : undefined),
                changed: "changed" in declared && declared.changed !== undefined ? readable(declared.changed) : null, index: indexId,
            });
        }
        return {
            components: components === undefined ? null : { read: readable(components.read), has: present(components.has), not: present(components.not), added: present(components.added), changed: readable(components.changed) },
            resources: resources === undefined ? null : { read: readable(resources.read), changed: present(resources.changed), is: readable(resources.is), not: readable(resources.not) },
            lookup: lookups,
        };
    };

    /** A synced system of this thread's own, declared to the world the first time; throws for one that can't cross. */
    const localOf = (leaf: Leaf): Local => {
        const known = localsByLeaf.get(leaf);
        if (known !== undefined) return known;
        const declaration = describe(leaf);
        // A number of this thread's, never posted as a name: the declaration names it.
        const number = numbers.size;
        numbers.set(`#synced:${number}`, number);
        const local: Local = { number, leaf, runner: null, ran: 0, results: [], placed: false, stopped: 0 };
        localsByLeaf.set(leaf, local);
        localsByNumber.set(number, new WeakRef(local));
        collected.register(leaf, number);
        post({ protocol: protocolName, kind: "synced", number, name: labelOfItem(leaf), declaration, added: false });
        return local;
    };

    /** Subscribes on the world's thread; the first value always comes later, through the mailbox. */
    const observe = (subscription: Subscription, decode: (views: Views) => unknown, objects = false) => (notify: Notify): (() => void) => {
        const number = observerCount++;
        const observer: Observer = { notify, reader: null, decode, active: true, held: null, objects };
        observers.set(number, observer);
        post({ protocol: protocolName, kind: "observe", observer: number, subscription });
        void listen();
        return () => {
            if (!observer.active) return;
            observer.active = false;
            observers.delete(number);
            post({ protocol: protocolName, kind: "unobserve", observer: number });
        };
    };

    const observeResource = (key: symbol) => {
        if (kindOf(key) !== "resource") throw new Error(`"${labelOf(key)}" isn't a registered resource.`);
        const layout = readableLayout(key);
        return observe({ kind: "resource", key: keyNumber(key) }, slot => readValue(slot, layout, 0));
    };

    const observeEntity = (entity: Entity, options: EntityOptions | undefined) => {
        if (options === undefined) {
            // Every struct component this thread knows, and its own objects, by its own numbers.
            const known: number[] = [];
            const knownOwn = new Set<symbol>();
            for (const [id, key] of identifiedKeys("component")) {
                const own = ownObject(key, claims);
                if (own) knownOwn.add(firstKeyOf(key));
                if (own || layoutOf(declarationOf(key)?.type).kind !== "object") known.push(numberOf(id, false, key));
            }
            return observe({ kind: "whole", entity, known }, slot => {
                const count = slot.f64[0];
                if (count < 0) return null;
                const value: { [key: symbol]: unknown } = {};
                let owned = 0;
                for (let k = 0; k < count; k++) {
                    const key = keys[slot.u32[2 + 2 * k]];
                    if (knownOwn.has(firstKeyOf(key))) owned++;
                    else value[key] = readValue(slot, layoutOf(declarationOf(key)?.type), slot.u32[3 + 2 * k]);
                }
                if (knownOwn.size === 0) return value;
                const location = located(entity);
                if (location === later) return later;
                if (location === null) return stale;
                // This thread's objects there: those the world listed, and no other it knew of.
                for (let k = 0; k < count; k++) {
                    const key = keys[slot.u32[2 + 2 * k]];
                    if (!knownOwn.has(firstKeyOf(key))) continue;
                    const object = objectOf(location, key);
                    if (object === later) return later;
                    if (!object.held) return stale;
                    value[key] = object.value;
                }
                let there = 0;
                for (const component of mirror === null ? [] : componentsAt(mirror, location.archetype)) {
                    const key = mirror?.keys.get(component);
                    if (typeof key === "symbol" && knownOwn.has(firstKeyOf(key))) there++;
                }
                return there === owned ? value : stale;
            }, knownOwn.size > 0);
        }
        const required = (options.required ?? []).map(symbolOf);
        const listed = [...required, ...(options.optional ?? []).map(symbolOf)];
        const layouts = listed.map(key => readableLayout(key, claims));
        const owned = listed.flatMap((key, k) => ownObject(key, claims) ? [k] : []);
        const plan = entityPlanOf(layouts);
        const subscription: Subscription = { kind: "entity", entity, required: required.map(keyNumber), optional: (options.optional ?? []).map(keyNumber) };
        return observe(subscription, slot => {
            if (slot.f64[0] === 0) return null;
            const value: { [key: symbol]: unknown } = {};
            for (let k = 0; k < listed.length; k++) if (slot.u8[8 + k] === 1) value[listed[k]] = readValue(slot, layouts[k], plan.offsets[k]);
            if (owned.length === 0) return value;
            const location = located(entity);
            if (location === later) return later;
            if (location === null) return stale;
            // This thread's objects there, present as the world's value says, else that value was older.
            for (const k of owned) {
                const object = objectOf(location, listed[k]);
                if (object === later) return later;
                if (object.held !== (slot.u8[8 + k] === 1)) return stale;
                if (object.held) value[listed[k]] = object.value;
            }
            return value;
        }, owned.length > 0);
    };

    const observeQuery = (options: QueryOptions, counting: boolean) => {
        const where: [number, unknown][] = [];
        for (const key of Object.getOwnPropertySymbols(options.where ?? {})) {
            readableLayout(key);
            where.push([keyNumber(key), Reflect.get(options.where ?? {}, key)]);
        }
        const order: [number, boolean][] = [];
        for (const key of Object.getOwnPropertySymbols(options.order ?? {})) {
            readableLayout(key);
            order.push([keyNumber(key), Reflect.get(options.order ?? {}, key) === true]);
        }
        const subscription: Subscription = {
            kind: counting ? "count" : "select",
            required: (options.required ?? []).map(keyNumber),
            not: (options.not ?? []).map(keyNumber),
            where, order, page: options.page ?? null,
        };
        return observe(subscription, counting ? slot => slot.f64[0] : slot => Array.from(slot.f64.subarray(1, 1 + slot.f64[0]), asEntity));
    };

    /** Posts a run of a system this thread numbers `number`; `local` for one of its own synced systems. */
    const runNumbered = (number: number, definition: Definition, input: unknown, local: Local | null): Promise<Report> => {
        if (failure !== null) return Promise.reject(failure);
        const ran = new Promise<Report>((resolve, reject) => {
            const next = ++sequence;
            runs.set(next, { resolve, reject, message: null, error: undefined, local });
            waiting.push({ sequence: next, number, definition, input });
            writeWaiting();
        });
        last = ran.catch(() => undefined);
        void listen();
        return ran;
    };

    const world: World = {
        run: (system, ...args) => {
            const [input]: readonly unknown[] = args;
            let definition: Definition;
            let id: string | undefined;
            try {
                definition = requireDefinition(system);
                // This thread's own synced systems run here, after the sync point of an empty run of the world's.
                const leaves = syncedLeavesOf(definition);
                if (leaves !== null) {
                    if (failure !== null) return Promise.reject(failure);
                    const locals = leaves.map(localOf);
                    if (locals.length === 1) return runNumbered(locals[0].number, locals[0].leaf, undefined, locals[0]);
                    return Promise.all(locals.map(local => runNumbered(local.number, local.leaf, undefined, local))).then(mergeReports);
                }
                id = idOfItem(definition);
                if (id === undefined) throw new Error(`System "${labelOfItem(definition)}" has no id, so it can't run from another thread; the build gives top-level systems one.`);
            }
            catch (error) {
                return Promise.reject(error);
            }
            if (failure !== null) return Promise.reject(failure);
            return runNumbered(numberOf(id, true, null), definition, input, null);
        },
        add: system => {
            const definition = requireDefinition(system);
            const leaves = syncedLeavesOf(definition);
            if (leaves === null) throw new Error("A joined thread adds only synced systems; others are added to ticks on the world's thread.");
            if (added.has(definition) || failure !== null) return;
            const locals = leaves.map(localOf);
            added.set(definition, locals);
            for (const local of locals) {
                const count = addedCounts.get(local) ?? 0;
                addedCounts.set(local, count + 1);
                if (count === 0) post({ protocol: protocolName, kind: "synced add", number: local.number });
            }
        },
        remove: system => {
            const definition = requireDefinition(system);
            if (syncedLeavesOf(definition) === null) throw new Error("A joined thread removes only synced systems; others are removed from ticks on the world's thread.");
            const locals = added.get(definition);
            if (locals === undefined) return;
            added.delete(definition);
            for (const local of locals) {
                const count = (addedCounts.get(local) ?? 0) - 1;
                if (count > 0) {
                    addedCounts.set(local, count);
                    continue;
                }
                addedCounts.delete(local);
                // No row of it runs from here on; the world unplaces it.
                local.stopped = sequence;
                synced?.stop(local);
                post({ protocol: protocolName, kind: "synced remove", number: local.number });
            }
        },
        share: () => {
            throw new Error("Only the world's thread shares it.");
        },
        observe: {
            // Values read match each resource's registered schema, so they have its type.
            resource: <R extends Resource.Key>(key: R) => observeResource(key) as Observe<ReadonlyResourceValue<R>>,
            // Values read match each component's registered schema, so they have its type.
            entity: ((entity: Entity, options?: EntityOptions) => observeEntity(entity, options)) as World["observe"]["entity"],
            // Selections are entities of the world.
            select: options => observeQuery(options, false) as Observe<readonly Entity[]>,
            count: options => observeQuery(options, true) as Observe<number>,
        },
        dispose: async () => {
            if (left) return;
            left = true;
            await last;
            for (const observer of observers.values()) observer.active = false;
            observers.clear();
            // Stops published so far are finalized here, so the world returns their indexes.
            if (failure === null) systems?.finalize();
            if (failure === null) post({ protocol: protocolName, kind: "leave" });
            fail(new Error("This thread left the world."));
            channel.close();
            release?.();
        },
        [Symbol.asyncDispose]: () => world.dispose(),
    };
    peersOf.set(world, () => peers.size);
    tablesOf.set(world, () => ({ systems: systems?.systems() ?? 0, synced: synced?.placedCount() ?? 0 }));
    return world;
};
