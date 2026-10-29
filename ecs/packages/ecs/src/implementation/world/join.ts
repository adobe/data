// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Thread } from '../../interface/thread/thread.js';
import type { World } from '../../interface/world/world.js';
import type { Input } from '../../interface/system/input.js';
import type { System } from '../../interface/system/system.js';
import { declarationOf, identifiedItems, idOfItem, idOfKey, indexOfLookup, keyOfId, labelOf, requireDefinition, threadOf, threadOfDeclaration, watchedBy, type Definition } from '../../interface/registry/index.js';
import { unsharedKeyOf } from './index-keys.js';
import { layoutOf, type Views } from '../../interface/registry/layout.js';
import {
    completedWord, done, fitsInline, inputByMessage, inputLayoutOf, inputMoved, lockName, noInput, pending, platformLocks, postedWord, protocolName, runSlots, signalWord, unposted, unreadWord,
    resolved, slotInput, slotNumber, slotPayload, slotStatus, slotViews, slotWords, slotsWord, threadChannel, type ObserverDeclaration, type ObserverIndex, type ObserverLookup, type ThreadChannel, type ToJoined, type ToPeer, type ToWorld,
} from './joining.js';
import { currentBuffer, sharedMemoryAvailable } from './memory.js';
import { logRunWord } from './move-log.js';
import { createMirror, nameComponent, rebuild, replay, type Mirror } from './mirror.js';
import { defaultOf } from './state.js';
import { createThreadSystems, type SystemSetup } from './thread-systems.js';
import { taskBlockWords } from './thread-tasks.js';
import { createThreadDirectory } from './thread-directory.js';
import { createThreadObserver, settledFor, type Local } from './thread-observer.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { isObserver, scheduleOf } from '../../interface/registry/schedule.js';
import { releaseInput, transferablesOf } from './transfers.js';

/** The last of the numbers of runs of several observer systems. */
const nothing = (): undefined => undefined;

/** An observer system's leaves: itself, or a composite's members when they're all observer; null for any other system. */
const observerLeavesOf = (definition: Definition): readonly Leaf[] | null => {
    if (isObserver(definition)) return [definition];
    if (definition.kind !== "composite") return null;
    const schedule = scheduleOf(definition);
    return schedule.tiers.length === 0 && schedule.observer.length > 0 ? schedule.observer : null;
};

/** Throws for a readonly system reading tables, which only the world's thread gives. */
const refuseTables = (leaves: readonly Leaf[]): void => {
    const reading = leaves.find(leaf => leaf.declaration.tables !== undefined);
    if (reading !== undefined) throw new Error(`System "${reading.name}" reads tables, which only the world's thread gives: run or add it there.`);
};

/** A run not yet settled: how to settle it, and its rejection once posted. */
type Run = { readonly resolve: (value: unknown) => void; readonly reject: (error: unknown) => void; message: ToJoined | null; error: unknown; readonly local: Local | null };

/** A run waiting for a free slot, or for the thread to have joined. */
type Waiting = { readonly sequence: number; readonly number: number; readonly definition: Definition; readonly input: unknown };

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
export const tablesOf = new WeakMap<World, () => { readonly systems: number; readonly observer: number }>();

/**
 * Joins, through `port`, the world another thread shared through the other end, once this thread has imported the
 * modules of the systems it runs and the keys they name, claiming `threads`, the logical threads it fills, the world's
 * own aside; none by default. Resolves to the joined world once the world accepted the claim, and rejects saying why
 * when it refused it, was disposed or its thread was gone first, and where memory can't be shared. Runs work as on the
 * world's thread, by the ids the build gives top-level systems and keys: a run of a system without one, or one the
 * world never imported, rejects. `add` and `remove` take observer systems, which run here after the world's sync
 * points, once for the newest when this thread fell behind. `dispose` disconnects this thread.
 *
 * On its first turn of the event loop after it resolved, it tells the world, whose `share` then resolves: what it did
 * as it resolved, as adding observer systems, arrived first. Runs go through this thread's slots in shared memory and
 * complete through its completed word, waiting on its signal word without blocking while any run, placed system or
 * observer system is active.
 */
export const joinWorld = (port: Parameters<World["share"]>[0], options: { readonly threads?: readonly Exclude<Thread, "world">[] } = {}): Promise<World> => {
    if (!sharedMemoryAvailable()) return Promise.reject(new Error("Without cross-origin isolation memory can't be shared, so no thread can join."));
    const channel = threadChannel<ToWorld, ToJoined>(port);
    /** Settles the join: once the world accepted the claim, or failed; null once settled. */
    let pendingJoin: { readonly resolve: (world: World) => void; readonly reject: (error: Error) => void } | null = null;
    const joining = new Promise<World>((resolve, reject) => { pendingJoin = { resolve, reject }; });
    /** Whether the world was told this thread is ready, which it is once its join resolved and it returned to its event loop. */
    let readied = false;
    /** Ends this thread's request for the lock the world's thread holds while it lives; null until it's told it. */
    let watchingWorld: AbortController | null = null;
    const ready = (): void => {
        if (readied || failure !== null) return;
        readied = true;
        post({ protocol: protocolName, kind: "ready" });
    };
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
    const numberOf = (id: string, item: boolean): number => {
        const known = numbers.get(id);
        if (known !== undefined) return known;
        const number = numbers.size;
        numbers.set(id, number);
        post({ protocol: protocolName, kind: "name", number, id, item });
        return number;
    };
    const keyNumber = (key: unknown): number => {
        const symbol = symbolOf(key);
        const id = idOfKey(symbol);
        if (id === undefined) throw new Error(`"${labelOf(symbol)}" has no id, so another thread can't name it; the build gives top-level keys one.`);
        return numberOf(id, false);
    };

    const claims: ReadonlySet<string> = new Set(options.threads ?? []);
    /** This thread's objects, following the world's rows, once it joined with claims; components named before it. */
    let mirror: Mirror | null = null;
    const named = new Map<number, symbol | null>();
    /** The systems the world places on this thread, once it joined with claims; setups that came before. */
    let systems: ReturnType<typeof createThreadSystems> | null = null;
    /** Observer systems placed on this thread, once it joined. */
    let observer: ReturnType<typeof createThreadObserver> | null = null;
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

    const write = ({ sequence, number, definition, input }: Waiting): void => {
        if (control === null) return;
        const slot = (sequence - 1) % runSlots;
        const base = slotsWord + slot * slotWords;
        control[base + slotStatus] = pending;
        control[base + slotNumber] = number;
        const schema = definition.kind === "composite" ? undefined : definition.input;
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
                // An input that can't be posted, as one holding a function: the world completes the run without running
                // it.
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

    /** Settles runs the world completed, in order: a done one at once, a rejected or resolved one once its message arrived. */
    const settle = (): void => {
        while (settled < completed && control !== null) {
            const next = settled + 1;
            const run = runs.get(next);
            const base = slotsWord + ((next - 1) % runSlots) * slotWords;
            const status = control[base + slotStatus];
            if (run !== undefined && status !== done && run.message === null) return;
            // A run of this thread's own observer system settles once a post for it ran here, to what its body returned
            // or with what it threw, unless it was removed since.
            if (run !== undefined && run.local !== null && !settledFor(run.local, next)) return;
            settled = next;
            runs.delete(next);
            if (run === undefined) continue;
            const { message, local } = run;
            if (run.error !== undefined) run.reject(run.error);
            else if (message !== null && message.kind === "rejected") run.reject(new Error(message.message));
            else if (local !== null && local.ran >= next && local.error !== undefined) run.reject(local.error);
            else if (local !== null) run.resolve(local.ran >= next ? local.value : undefined);
            else if (status === resolved && message !== null && message.kind === "resolved") run.resolve(message.value);
            else run.resolve(undefined);
        }
    };

    /** Names a component whose objects this thread fills, once its mirror exists. */
    const name = (component: number, key: symbol | null): void => {
        if (mirror === null) {
            named.set(component, key);
            return;
        }
        nameComponent(mirror, component, key, defaultOf);
    };

    /** Whether the last `process` finished a task, so the next of a tick's tasks may follow it closely. */
    let tasked = false;
    const process = (): void => {
        if (control === null) return;
        Atomics.store(control, unreadWord, 0);
        // A task first: the world waits for it. Then finalizers of stops no task replayed.
        tasked = systems?.process() ?? false;
        systems?.finalize();
        if (observer !== null && observer.process() > 0) observerRan = true;
        completed = Atomics.load(control, completedWord);
        settle();
        writeWaiting();
    };

    let listening = false;
    const active = (): boolean => control !== null && failure === null && (runs.size > 0 || systems !== null || observer?.active() === true);
    let turn: (() => Promise<void>) | null = null;
    /** The runs the world had finished when this thread last returned to its event loop, and when it did. */
    let turnedRun = 0;
    let turnedAt = 0;
    const runNow = (): number => mirror === null ? turnedRun : Atomics.load(mirror.header, logRunWord);
    /** Whether observer systems ran since this thread last returned to its event loop: each post follows a sync point. */
    let observerRan = false;
    const turned = (): void => {
        turnedRun = runNow();
        turnedAt = performance.now();
        observerRan = false;
    };
    /**
     * Whether to return to the event loop before going on: once a run's or tick's tiers finished since it last did,
     * which is after the tick's last task here, or after `busyMilliseconds`.
     */
    const due = (): boolean => observerRan || runNow() !== turnedRun || performance.now() - turnedAt > busyMilliseconds;
    const nextTurn = async (): Promise<void> => {
        turn ??= createTurn();
        await turn();
        turned();
    };
    /**
     * Waits on the signal word without blocking while a run or system is active, so a quiet thread does no work. It
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

    /**
     * Rejects the join while it's pending, then every run not yet settled, and every later one; releases inputs moved
     * here, and closes channels to other threads. A join that failed lets go of its lock and closes its port.
     */
    const fail = (error: Error): void => {
        failure ??= error;
        watchingWorld?.abort();
        if (pendingJoin !== null) {
            pendingJoin.reject(failure);
            pendingJoin = null;
            release?.();
            channel.close();
        }
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
                observer = createThreadObserver({
                    directory, mirror, post: sent => channel.post(sent), localOf: number => localsByNumber.get(number)?.deref(),
                    current: () => {
                        if (replayed === null) return true;
                        const state = replay(replayed);
                        return state !== "held" && (state !== "lapped" || rebuild(replayed) === "rebuilt");
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
                pendingJoin?.resolve(world);
                pendingJoin = null;
                turn ??= createTurn();
                void turn().then(ready);
                return;
            }
            case "refused": return fail(new Error(message.message));
            case "thread lock": {
                // Granted once the world's thread no longer holds it: it ended.
                if (watchingWorld !== null || failure !== null || locks === null) return;
                watchingWorld = new AbortController();
                locks.request(message.lock, { signal: watchingWorld.signal }, () => fail(new Error("The world's thread is gone."))).catch(() => {});
                return;
            }
            case "disposed": {
                // Its finalizers release what this thread holds, as the world's do.
                systems?.disposed();
                return fail(new Error("The world is disposed."));
            }
            case "resolved":
            case "rejected": {
                const run = runs.get(message.sequence);
                if (run !== undefined) run.message = message;
                return settle();
            }
            case "component": {
                // Its key here, if this thread has one, for a component of a thread it claims.
                const key = message.id === null ? undefined : keyOfId(message.id);
                name(message.component, key !== undefined && ownObject(key, claims) ? key : null);
                // A task waiting for this component's key runs now, and posts of observer systems.
                systems?.process();
                observer?.process();
                return;
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
                // What waited for them goes on: stops, a task, observer systems.
                systems?.finalize();
                systems?.process();
                observer?.process();
                return;
            }
            case "observer": {
                observer?.setup(message.systems);
                process();
                void listen();
                return;
            }
            case "unplace observers": return observer?.unplace(message.indexes);
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
    channel.onClose(() => fail(new Error("The world's thread is gone.")));
    // A world's worker that failed before it answered never will; one that answered goes on, as a browser worker that
    // threw does.
    channel.onFailure(message => { if (pendingJoin !== null) fail(new Error(`The world's thread failed before it answered: ${message}`)); });
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
        const lock = lockName();
        void locks.request(lock, () => new Promise<void>(done => {
            // A join that failed first, as when the world's end closed, holds nothing.
            if (failure !== null) return done();
            release = done;
            sendHeld(lock);
        }));
    }
    // A port whose other end closed before this thread joined through it hears no close.
    if (channel.closed()) fail(new Error("The world's thread is gone."));

    /** This thread's own observer systems, by value and by its number for them, while they live; those added, by the value added. */
    const localsByLeaf = new WeakMap<Leaf, Local>();
    const localsByNumber = new Map<number, WeakRef<Local>>();
    const added = new Map<Definition, readonly Local[]>();
    const addedCounts = new Map<Local, number>();
    /** Tells the world an observer system of this thread's own is collected, so it forgets it. */
    const collected = new FinalizationRegistry<number>(number => {
        localsByNumber.delete(number);
        if (failure === null) post({ protocol: protocolName, kind: "observer drop", number });
    });

    /** What an observer system reads, for the world, by this thread's numbers; throws for what can't cross. */
    const describe = (leaf: Leaf): ObserverDeclaration => {
        const label = leaf.name;
        const readable = (keys: readonly unknown[] | undefined): number[] => (keys ?? []).map(key => {
            const symbol = symbolOf(key);
            if (layoutOf(declarationOf(symbol)?.type).kind === "object" && !ownObject(symbol, claims)) {
                throw new Error(`Observer system "${label}" reads "${labelOf(symbol)}", an object, which lives on another thread than this joined one.`);
            }
            return keyNumber(symbol);
        });
        const present = (keys: readonly unknown[] | undefined): number[] => (keys ?? []).map(keyNumber);
        const { components, resources, lookup } = leaf.declaration;
        const lookups: ObserverLookup[] = [];
        for (const name of Object.keys(lookup ?? {})) {
            const declared = lookup?.[name];
            if (declared === undefined) continue;
            const index = indexOfLookup(declared);
            const read = readable(declared.read);
            let indexed: string | ObserverIndex | null = null;
            if (index !== undefined) {
                const object = unsharedKeyOf(index.declaration.key);
                if (object !== undefined) throw new Error(`Observer system "${label}" looks up through index "${index.name}", whose key part "${labelOf(object.key)}" is ${object.what}, so it runs only on the world's thread.`);
                if (declared.changed === true) throw new Error(`Observer system "${label}" runs when index "${index.name}" changed, as its lookup "${name}"'s changed is true, so it runs only on the world's thread.`);
                const { key, components: held, sorted, unique } = index.declaration;
                // One without an id, made in a function, is named by its declaration, and the world makes one like it.
                indexed = idOfItem(index) ?? {
                    name: index.name, key: readable(key), has: present(held?.has), not: present(held?.not), sorted: sorted === true, unique: unique === true,
                };
            }
            lookups.push({
                name, read, has: present("has" in declared ? declared.has : undefined), optional: present("optional" in declared ? declared.optional : undefined), not: present("not" in declared ? declared.not : undefined),
                changed: "changed" in declared && declared.changed !== undefined ? readable(watchedBy(declared)) : null, index: indexed,
            });
        }
        return {
            components: components === undefined ? null : { read: readable(components.read), has: present(components.has), optional: present(components.optional), not: present(components.not), added: present(components.added), changed: readable(components.changed), where: components.where !== undefined },
            resources: resources === undefined ? null : { read: readable(resources.read), changed: present(resources.changed), is: readable(resources.is), not: readable(resources.not) },
            lookup: lookups,
        };
    };

    /** An observer system of this thread's own, declared to the world the first time; throws for one that can't cross. */
    const localOf = (leaf: Leaf): Local => {
        const known = localsByLeaf.get(leaf);
        if (known !== undefined) return known;
        const declaration = describe(leaf);
        // A number of this thread's, never posted as a name: the declaration names it.
        const number = numbers.size;
        numbers.set(`#observer:${number}`, number);
        const local: Local = { number, leaf, runner: null, ran: 0, value: undefined, error: undefined, placed: false, stopped: 0 };
        localsByLeaf.set(leaf, local);
        localsByNumber.set(number, new WeakRef(local));
        collected.register(leaf, number);
        post({ protocol: protocolName, kind: "observer", number, name: leaf.name, declaration, added: false });
        return local;
    };

    /** Posts a run of a system this thread numbers `number`; `local` for one of its own observer systems. */
    const runNumbered = (number: number, definition: Definition, input: unknown, local: Local | null): Promise<unknown> => {
        if (failure !== null) return Promise.reject(failure);
        const ran = new Promise<unknown>((resolve, reject) => {
            const next = ++sequence;
            runs.set(next, { resolve, reject, message: null, error: undefined, local });
            waiting.push({ sequence: next, number, definition, input });
            writeWaiting();
        });
        last = ran.catch(() => undefined);
        void listen();
        return ran;
    };

    /** Runs a system as `run` does, with the input given after it, if any. */
    const runOn = (system: System<unknown, unknown>, args: readonly unknown[]): Promise<unknown> => {
        const [input] = args;
        let definition: Definition;
        let id: string | undefined;
        try {
            definition = requireDefinition(system);
            // This thread's own observer systems run here, after the sync point of an empty run of the world's.
            const leaves = observerLeavesOf(definition);
            if (leaves !== null) {
                refuseTables(leaves);
                if (failure !== null) return Promise.reject(failure);
                const locals = leaves.map(localOf);
                if (locals.length === 1 && definition.kind !== "composite") return runNumbered(locals[0].number, locals[0].leaf, undefined, locals[0]);
                return Promise.all(locals.map(local => runNumbered(local.number, local.leaf, undefined, local))).then(nothing);
            }
            id = idOfItem(definition);
            if (id === undefined) throw new Error(`System "${definition.name}" has no id, so it can't run from another thread; the build gives top-level systems one.`);
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (failure !== null) return Promise.reject(failure);
        return runNumbered(numberOf(id, true), definition, input, null);
    };

    const world: World = {
        // A run gives what its system's body returned, `R` by the system's type.
        run: <I, R>(system: System<I, R>, ...args: Input<NoInfer<I>>) => runOn(system, args) as Promise<R>,
        add: system => {
            const definition = requireDefinition(system);
            const leaves = observerLeavesOf(definition);
            if (leaves === null) throw new Error(`System "${definition.name}" isn't readonly, and a joined thread adds only readonly systems: declare it readonly: true to read the world from this thread, or add it on the world's thread.`);
            refuseTables(leaves);
            if (added.has(definition) || failure !== null) return;
            const locals = leaves.map(localOf);
            added.set(definition, locals);
            for (const local of locals) {
                const count = addedCounts.get(local) ?? 0;
                addedCounts.set(local, count + 1);
                if (count === 0) post({ protocol: protocolName, kind: "observer add", number: local.number });
            }
        },
        remove: system => {
            const definition = requireDefinition(system);
            if (observerLeavesOf(definition) === null) throw new Error(`System "${definition.name}" isn't readonly, and a joined thread removes only readonly systems: others are removed on the world's thread.`);
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
                observer?.stop(local);
                post({ protocol: protocolName, kind: "observer remove", number: local.number });
            }
        },
        share: () => Promise.reject(new Error("Only the world's thread shares it.")),
        dispose: async () => {
            if (left) return;
            left = true;
            await last;
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
    tablesOf.set(world, () => ({ systems: systems?.systems() ?? 0, observer: observer?.placedCount() ?? 0 }));
    return joining;
};
