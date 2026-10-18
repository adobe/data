import type { Entity } from '../../interface/entity/entity.js';
import type { Observe } from '../../interface/observe/observe.js';
import type { Resource } from '../../interface/resource/resource.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import type { JoinOptions, Port } from '../../interface/world/join.js';
import type { Report } from '../../interface/world/report.js';
import type { World } from '../../interface/world/world.js';
import { declarationOf, idOfItem, idOfKey, identifiedKeys, kindOf, labelOf, labelOfItem, requireDefinition, type Definition } from '../../interface/registry/index.js';
import { layoutOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { asEntity } from './entities.js';
import {
    clean, completedWord, fitsInline, inputByMessage, inputLayoutOf, noInput, pending, platformLocks, postedWord, protocolName, runSlots, signalWord,
    slotInput, slotNumber, slotSequence, slotStatus, slotViews, slotWords, slotsWord, threadChannel, type Subscription, type ToJoined, type ToWorld,
} from './joining.js';
import { entityPlanOf, mailboxReader, readSlot, readValue, type MailboxReader } from './mailbox.js';
import { sharedMemoryAvailable } from './memory.js';
import type { EntityOptions, QueryOptions } from './reads.js';

type Notify = (value: unknown) => void;

/** Shared by every clean report: read-only, so none needs its own. */
const none: readonly never[] = [];
const cleanReport: Report = { failures: none, skipped: none, dropped: 0 };

/** A run not yet settled: how to settle it, and its report or rejection once posted. */
type Run = { readonly resolve: (report: Report) => void; readonly reject: (error: Error) => void; message: ToJoined | null };

/** A run waiting for a free slot, or for the thread to have joined. */
type Waiting = { readonly sequence: number; readonly number: number; readonly definition: Definition; readonly input: unknown };

/** An observer on this thread: its mailbox once the world placed it, and how a value is read from a slot. */
type Observer = { readonly notify: Notify; reader: MailboxReader | null; readonly decode: (views: Views) => unknown; active: boolean };

const hasWaitAsync = (): boolean => typeof Atomics.waitAsync === "function";

/** A key's layout, for an observer reading its values. Throws for a key without an id, or one holding objects. */
const readableLayout = (key: symbol): Layout => {
    const layout = layoutOf(declarationOf(key)?.type);
    if (layout.kind === "object") throw new Error(`An observer on a joined thread reads "${labelOf(key)}", an object, which lives on another thread.`);
    return layout;
};

/** A key, which is a symbol. */
const symbolOf = (key: unknown): symbol => {
    if (typeof key !== "symbol") throw new Error(`"${labelOf(key)}" isn't a key: a key is a symbol.`);
    return key;
};

/** Reports an error thrown by an observer's notify, as an event listener's would be. */
const rethrow = (error: unknown): void => queueMicrotask(() => { throw error; });

/**
 * Joins the world shared through the other end of `port`, as `World.join` does: runs go through this thread's slots
 * in shared memory and complete through its completed word, and observers read their mailboxes, waiting on its signal
 * word without blocking while any run or observer is active.
 */
export const joinWorld = (port: Port, options: JoinOptions = {}): World => {
    if (!sharedMemoryAvailable()) throw new Error("Without cross-origin isolation memory can't be shared, so no thread can join.");
    const channel = threadChannel<ToWorld, ToJoined>(port);
    /** Messages posted before the join message is, which waits for this thread's lock. */
    let held: ToWorld[] | null = [];
    const post = (message: ToWorld): void => {
        if (held === null) channel.post(message);
        else held.push(message);
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
            post({ protocol: protocolName, kind: "input", sequence, input });
            control[base + slotInput] = inputByMessage;
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
            settled = next;
            runs.delete(next);
            if (run === undefined) continue;
            const { message } = run;
            if (message === null) run.resolve(cleanReport);
            else if (message.kind === "report") run.resolve(message.report);
            else if (message.kind === "rejected") run.reject(new Error(message.message));
        }
    };

    const processObservers = (): void => {
        if (memory === null || observers.size === 0) return;
        const buffer = memory.buffer;
        for (const observer of observers.values()) {
            if (observer.reader === null || !observer.active) continue;
            const slot = readSlot(observer.reader, buffer);
            if (slot === null) continue;
            try {
                observer.notify(observer.decode(slot));
            }
            catch (error) {
                rethrow(error);
            }
        }
    };

    const process = (): void => {
        if (control === null) return;
        completed = Atomics.load(control, completedWord);
        settle();
        writeWaiting();
        processObservers();
    };

    let listening = false;
    const active = (): boolean => control !== null && failure === null && (runs.size > 0 || observers.size > 0);
    /** Waits on the signal word without blocking while a run or observer is active, so a quiet thread does no work. */
    const listen = async (): Promise<void> => {
        if (listening || !hasWaitAsync()) return;
        listening = true;
        try {
            while (active() && control !== null) {
                const seen = Atomics.load(control, signalWord);
                process();
                if (!active()) break;
                const waited = Atomics.waitAsync(control, signalWord, seen);
                if (waited.async) await waited.value;
            }
        }
        finally {
            listening = false;
        }
    };

    /** Rejects every run not yet settled, and every later one. */
    const fail = (error: Error): void => {
        failure ??= error;
        for (const run of runs.values()) run.reject(failure);
        runs.clear();
        waiting.length = 0;
        if (control !== null) Atomics.notify(control, signalWord);
    };

    channel.onMessage(message => {
        switch (message.kind) {
            case "joined": {
                memory = message.memory;
                control = new Int32Array(memory.buffer, message.control, (slotsWord + runSlots * slotWords));
                views = slotViews(memory.buffer, message.control);
                worldWaits = message.waits;
                writeWaiting();
                void listen();
                return;
            }
            case "refused": return fail(new Error(message.message));
            case "disposed": return fail(new Error("The world is disposed."));
            case "report":
            case "rejected": {
                const run = runs.get(message.sequence);
                if (run !== undefined) run.message = message;
                return settle();
            }
            case "mailbox": {
                const observer = observers.get(message.observer);
                if (observer === undefined || memory === null) return;
                observer.reader = mailboxReader(memory.buffer, message.offset);
                processObservers();
                void listen();
                return;
            }
            case "wake": return process();
        }
    });
    // Held while this thread lives, so the world hears of its end however it ends: a browser worker ended from outside
    // its port reports nothing else.
    const locks = platformLocks();
    let release: (() => void) | null = null;
    const joinMessage = (lock: string | null): ToWorld => ({ protocol: protocolName, kind: "join", threads: options.threads ?? [], waits: hasWaitAsync(), lock });
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

    /** Subscribes on the world's thread; the first value always comes later, through the mailbox. */
    const observe = (subscription: Subscription, decode: (views: Views) => unknown) => (notify: Notify): (() => void) => {
        const number = observerCount++;
        const observer: Observer = { notify, reader: null, decode, active: true };
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
            // Every struct component this thread knows, by its own numbers.
            const known: number[] = [];
            for (const [id, key] of identifiedKeys("component")) if (layoutOf(declarationOf(key)?.type).kind !== "object") known.push(numberOf(id, false, key));
            return observe({ kind: "whole", entity, known }, slot => {
                const count = slot.f64[0];
                if (count < 0) return null;
                const value: { [key: symbol]: unknown } = {};
                for (let k = 0; k < count; k++) {
                    const key = keys[slot.u32[2 + 2 * k]];
                    value[key] = readValue(slot, layoutOf(declarationOf(key)?.type), slot.u32[3 + 2 * k]);
                }
                return value;
            });
        }
        const required = (options.required ?? []).map(symbolOf);
        const listed = [...required, ...(options.optional ?? []).map(symbolOf)];
        const layouts = listed.map(key => readableLayout(key));
        const plan = entityPlanOf(layouts);
        const subscription: Subscription = { kind: "entity", entity, required: required.map(keyNumber), optional: (options.optional ?? []).map(keyNumber) };
        return observe(subscription, slot => {
            if (slot.f64[0] === 0) return null;
            const value: { [key: symbol]: unknown } = {};
            for (let k = 0; k < listed.length; k++) if (slot.u8[8 + k] === 1) value[listed[k]] = readValue(slot, layouts[k], plan.offsets[k]);
            return value;
        });
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

    const world: World = {
        run: (system, ...args) => {
            const [input]: readonly unknown[] = args;
            let definition: Definition;
            let id: string | undefined;
            try {
                definition = requireDefinition(system);
                id = idOfItem(definition);
                if (id === undefined) throw new Error(`System "${labelOfItem(definition)}" has no id, so it can't run from another thread; the build gives top-level systems one.`);
            }
            catch (error) {
                return Promise.reject(error);
            }
            if (failure !== null) return Promise.reject(failure);
            const number = numberOf(id, true, null);
            const ran = new Promise<Report>((resolve, reject) => {
                const next = ++sequence;
                runs.set(next, { resolve, reject, message: null });
                waiting.push({ sequence: next, number, definition, input });
                try {
                    writeWaiting();
                }
                catch (error) {
                    // An input that can't be posted, as one holding a function.
                    runs.delete(next);
                    waiting.splice(waiting.findIndex(run => run.sequence === next), 1);
                    reject(error);
                }
            });
            last = ran.catch(() => undefined);
            void listen();
            return ran;
        },
        add: () => {
            throw new Error("Systems are added to ticks on the world's thread.");
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
            if (failure === null) post({ protocol: protocolName, kind: "leave" });
            fail(new Error("This thread left the world."));
            channel.close();
            release?.();
        },
        [Symbol.asyncDispose]: () => world.dispose(),
    };
    return world;
};
