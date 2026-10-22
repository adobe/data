// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from '../../interface/world/world.js';
import type { WorkerError } from './protocol.js';
import type { Schema } from '../../interface/schema/schema.js';
import { layoutOf, viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { lineWords } from './protocol.js';

// What a world's thread and a thread that joined it share: their messages, the joined thread's control words and run
// slots in shared memory, and how a run's input is written into a slot.

/** Marks this channel's messages, so a port that carries others too, such as a worker's scope, can share it. */
export const protocolName = "@adobe/ecs/join@1";

/** An index without an id, by its declaration, its keys by a joined thread's numbers: the world makes one like it. */
export type ObserverIndex = {
    readonly name: string;
    readonly key: readonly number[];
    readonly has: readonly number[];
    readonly not: readonly number[];
    readonly sorted: boolean;
    readonly unique: boolean;
};

/** A lookup of an observer system a joined thread declares: its keys by that thread's numbers, its index by id or declaration. */
export type ObserverLookup = {
    readonly name: string;
    readonly read: readonly number[];
    readonly has: readonly number[];
    readonly not: readonly number[];
    /** Null where it doesn't declare `changed`. */
    readonly changed: readonly number[] | null;
    readonly index: string | ObserverIndex | null;
};

/** What an observer system a joined thread declares reads, by that thread's numbers for its keys. */
export type ObserverDeclaration = {
    readonly components: { readonly read: readonly number[]; readonly has: readonly number[]; readonly not: readonly number[]; readonly added: readonly number[]; readonly changed: readonly number[] } | null;
    readonly resources: { readonly read: readonly number[]; readonly changed: readonly number[]; readonly is: readonly number[]; readonly not: readonly number[] } | null;
    readonly lookup: readonly ObserverLookup[];
};

/** An observer system the world places on a joined thread: its index there, the thread's own by its number or one by its id, and its block. */
export type ObserverSetup = {
    readonly index: number;
    readonly local: number | null;
    readonly id: string | null;
    readonly keys: readonly (readonly [number, string])[];
    /** The byte offset of its block (`joined-observer.ts`). */
    readonly block: number;
    /**
     * For one reading only struct resources, the byte offset of a second block: its posts, in either, hold copies of
     * what they read, so it runs them without this thread's objects.
     */
    readonly spare: number | null;
    readonly indexes: readonly (readonly [string, number])[];
};

/** From a joined thread to the world's: messages are handled in the order they're posted. */
export type ToWorld = { readonly protocol: typeof protocolName } & (
    /**
     * First: the logical threads it claims; whether it can wait without blocking, so it's woken without a message; and
     * the name of a Web Lock it holds while it lives, where the platform has them, which the world then requests, so
     * it's granted when the thread ends however it ends.
     */
    | {
        readonly kind: "join"; readonly threads: readonly string[]; readonly waits: boolean; readonly lock: string | null;
        /** With claims: the ids of the systems and finalizers this thread imported, so the world checks those it places here. */
        readonly imported: readonly string[];
    }
    /** The id of a key or system it numbers `number`, posted before the first use of that number. */
    | { readonly kind: "name"; readonly number: number; readonly id: string; readonly item: boolean }
    /** The input of run `sequence`, which its slot says comes by message. */
    | { readonly kind: "input"; readonly sequence: number; readonly input: unknown }
    /**
     * The input of run `sequence` of joined thread `from`, which its slot says moved to this thread, arrived here: the
     * world starts that run once this arrives.
     */
    | { readonly kind: "received"; readonly from: number; readonly sequence: number }
    /** Where the world can't wait without blocking: runs were posted. */
    | { readonly kind: "wake" }
    | { readonly kind: "leave" }
    /**
     * After task `sequence` is done, when its completion says a message follows: its systems' errors and spilled
     * segments, by position in the task; posted after the thread's numbers for keys its commands named first. `stamps`
     * are the objects tails wrote from their snapshots, as position in the task, entity and component, which the world
     * stamps changed at their tick.
     */
    | {
        readonly kind: "completed"; readonly sequence: number;
        readonly errors: readonly (readonly [number, WorkerError])[]; readonly spills: readonly (readonly [number, Uint8Array])[];
        readonly stamps?: readonly number[];
    }
    /** What its finalizers threw, by their index on this thread, for the world's next report. */
    | { readonly kind: "finalized"; readonly errors: readonly (readonly [number, WorkerError])[] }
    /** It dropped what it held for the systems unplaced at these indexes, which the world may place again. */
    | { readonly kind: "unplaced"; readonly indexes: readonly number[] }
    /**
     * An observer system of its own, by its number for it, which no other of its messages uses, with its label and what
     * it reads; added to ticks with `added`.
     */
    | { readonly kind: "observer"; readonly number: number; readonly name: string; readonly declaration: ObserverDeclaration; readonly added: boolean }
    /** Its observer system `number` is added to ticks, removed from them, or no longer needed, its value collected. */
    | { readonly kind: "observer add" | "observer remove" | "observer drop"; readonly number: number }
    /** What observer systems placed on it threw, by their indexes there, for the world's next report. */
    | { readonly kind: "observer failed"; readonly errors: readonly (readonly [number, WorkerError])[] }
    /** It dropped the observer systems at these indexes, which the world unplaced. */
    | { readonly kind: "observer dropped"; readonly indexes: readonly number[] }
    /** A post it claimed and couldn't run yet, owed to a run: the world posts it again between runs. */
    | { readonly kind: "observer again" }
);

/** From the world's thread to a joined one. */
export type ToJoined = { readonly protocol: typeof protocolName } & (
    /**
     * The memory, and the byte offset of the thread's control words; whether the world can wait without blocking; the
     * byte offsets of its move log's header and its task block (`thread-tasks.ts`), null without claims; and its
     * number, which storage flags name.
     */
    | {
        readonly kind: "joined"; readonly memory: WebAssembly.Memory; readonly control: number; readonly waits: boolean; readonly log: number | null;
        readonly tasks: number | null; readonly thread: number;
    }
    /**
     * Systems the world places on the thread, each by its index there and its id, with the world's numbers for its keys
     * and the byte offset of its removed word, which the thread checks before it runs the system.
     */
    | { readonly kind: "systems"; readonly systems: readonly { readonly index: number; readonly id: string; readonly keys: readonly (readonly [number, string])[]; readonly removed: number; readonly indexes: readonly (readonly [string, number])[] }[] }
    /**
     * Systems the world removed, by their indexes there, whose removed words are set: the thread drops what it holds
     * for them once it finished task `sequence`, the last posted before, and says so.
     */
    | { readonly kind: "unplace"; readonly indexes: readonly number[]; readonly sequence: number }
    /** Observer systems the world places on the thread, which run there after sync points. */
    | { readonly kind: "observer"; readonly systems: readonly ObserverSetup[] }
    /** Observer systems the world removed, by their indexes there, whose removed words are set: the thread drops them and says so. */
    | { readonly kind: "unplace observers"; readonly indexes: readonly number[] }
    /** Finalizers the world places on the thread, as systems are: each one's index there, its id, and the world's numbers for its keys. */
    | { readonly kind: "finalizers"; readonly finalizers: readonly { readonly index: number; readonly id: string; readonly keys: readonly (readonly [number, string])[] }[] }
    /**
     * The input of task `sequence`, which its payload says comes by message; or, with `held`, the input of run
     * `held[1]` of joined thread `held[0]`, which moved here when it was run.
     */
    | { readonly kind: "task input"; readonly sequence: number; readonly input: unknown; readonly held?: readonly [number, number] }
    /**
     * A channel to joined thread `thread`, claiming `threads`, through `port`: a run there of a system on one of them
     * moves the Transferable values of its input here through it, and one here moves them there.
     */
    | { readonly kind: "peer"; readonly thread: number; readonly threads: readonly string[]; readonly port: Parameters<World["share"]>[0] }
    /** Joined thread `thread` is gone: its channel closes, and its threads are the world's again. */
    | { readonly kind: "unpeer"; readonly thread: number }
    /** Run `sequence` of joined thread `from`, whose input moved here, finished: what of it no task took is released. */
    | { readonly kind: "release"; readonly from: number; readonly sequence: number }
    /** A component whose objects the thread fills, by the world's number, with its id: null for one without. */
    | { readonly kind: "component"; readonly component: number; readonly id: string | null }
    | { readonly kind: "refused"; readonly message: string }
    | { readonly kind: "rejected"; readonly sequence: number; readonly message: string }
    /** Where the joined thread can't wait without blocking: runs completed, or a task or observer post waits for it. */
    | { readonly kind: "wake" }
    | { readonly kind: "disposed" }
);

/** From a joined thread to another, through their channel: the input of run `sequence`, moved from that thread. */
export type ToPeer = { readonly protocol: typeof protocolName; readonly kind: "transfer"; readonly sequence: number; readonly input: unknown };

/** A joined thread's channel to the world, or the world's to it, over the port it was given; or a joined thread's to another. */
export type ThreadChannel<Send, Receive> = {
    /** Posts a message, moving the Transferable values `transfer` lists; throws for a value that can't be posted. */
    readonly post: (message: Send, transfer?: readonly object[]) => void;
    /** Sets the one handler for this protocol's messages; others are ignored. */
    readonly onMessage: (handler: (message: Receive) => void) => void;
    /** Sets the one handler for the other end's end: a `MessagePort`'s close, or a node worker's exit. */
    readonly onClose: (handler: () => void) => void;
    /** Closes a `MessagePort`; a worker or a worker's scope stays as it is, its owner's to end. */
    readonly close: () => void;
};

/** Whether a port is a `MessagePort` this thread may close: not a worker, nor its scope, whose `close` ends the worker. */
const isMessagePort = (port: Parameters<World["share"]>[0]): boolean =>
    typeof globalThis.MessagePort === "function" && port instanceof globalThis.MessagePort
    && port !== globalThis.process?.getBuiltinModule?.("node:worker_threads")?.parentPort;

const isOurs = (data: unknown): boolean => typeof data === "object" && data !== null && Reflect.get(data, "protocol") === protocolName;

/**
 * A port as a channel: a browser `MessagePort`, `Worker` or worker scope through `addEventListener`, and a node
 * `MessagePort`, `Worker` or `parentPort` through `on`.
 */
export const threadChannel = <Send, Receive>(port: Parameters<World["share"]>[0]): ThreadChannel<Send, Receive> => {
    const on: unknown = Reflect.get(port, "on");
    const listen: unknown = Reflect.get(port, "addEventListener");
    const close: unknown = Reflect.get(port, "close");
    const start: unknown = Reflect.get(port, "start");
    const postMessage: unknown = Reflect.get(port, "postMessage");
    const subscribe = (event: string, listener: (value: unknown) => void): void => {
        if (typeof on === "function") Reflect.apply(on, port, [event, listener]);
        else if (typeof listen === "function") Reflect.apply(listen, port, [event, listener]);
    };
    return {
        post: (message, transfer) => {
            if (typeof postMessage === "function") Reflect.apply(postMessage, port, transfer === undefined || transfer.length === 0 ? [message] : [message, transfer]);
        },
        onMessage: handler => {
            // Node gives the data itself; the browser, an event holding it.
            const node = typeof on === "function";
            subscribe("message", value => {
                const data: unknown = node ? value : typeof value === "object" && value !== null ? Reflect.get(value, "data") : undefined;
                // A message marked with the protocol is one the other end posted as `Receive`.
                if (isOurs(data)) handler(data as Receive);
            });
            if (!node && typeof start === "function") Reflect.apply(start, port, []);
        },
        onClose: handler => {
            let closed = false;
            const once = (): void => {
                if (closed) return;
                closed = true;
                handler();
            };
            subscribe("close", once);
            if (typeof on === "function") subscribe("exit", once);
        },
        close: () => { if (isMessagePort(port) && typeof close === "function") Reflect.apply(close, port, []); },
    };
};

/**
 * A joined thread's control words, each on a line of its own: the signal it waits on, which the world bumps when runs
 * complete or a task or observer post waits for it, beside whether a wake is unread, which the thread clears before it
 * reads what's new, so the world notifies only a thread that has read every earlier wake; the last run it posted; and
 * the last run the world completed. Then its run slots.
 */
export const signalWord = 0;
export const unreadWord = 1;
export const postedWord = lineWords;
export const completedWord = 2 * lineWords;
export const slotsWord = 3 * lineWords;

/**
 * Runs in flight a joined thread holds room for, each in slot `(sequence - 1) % runSlots`: its status and the run's
 * number, which the world writes before completing it, the system's number, and its input's length in bytes, then the
 * input.
 */
export const runSlots = 64;
export const slotWords = 64;
export const slotStatus = 0;
export const slotNumber = 1;
export const slotRun = 2;
export const slotInput = 3;
export const slotPayload = 4;
export const controlBytes = (slotsWord + runSlots * slotWords) * 4;
/** Input written in its slot, at most this many bytes. */
export const inlineInputBytes = (slotWords - slotPayload) * 4;
/**
 * A slot's input length for none, for an input posted as a message, and for one moved to the joined thread its system
 * runs on, whose number is the slot's first payload word.
 */
export const noInput = -1;
export const inputByMessage = -2;
export const inputMoved = -3;
/** A slot's system number for a run whose input couldn't be posted, which the world completes without running. */
export const unposted = -1;
/** Slot statuses: in flight; done, its number in the slot; rejected, the rejection posted. */
export const pending = 0;
export const done = 1;
export const rejected = 2;

/** The schema with every number widened to f64, so a run's input crosses exactly as given. */
const widened = (schema: Schema): Schema => {
    if (!("type" in schema)) return schema;
    switch (schema.type) {
        case "number":
        case "integer": return { type: "number" };
        case "array": return { ...schema, items: widened(schema.items) };
        case "object": {
            const properties: { [name: string]: Schema } = {};
            for (const name of Object.keys(schema.properties)) properties[name] = widened(schema.properties[name]);
            return { ...schema, properties };
        }
        default: return schema;
    }
};

const inputLayouts = new WeakMap<object, Layout | null>();

/**
 * How a system's input is written into a slot: a struct schema of at most `inlineInputBytes`, with every number an
 * f64; null for any other, whose input is posted. Both threads compute it from the same declaration.
 */
export const inputLayoutOf = (system: object, schema: Schema | undefined): Layout | null => {
    const known = inputLayouts.get(system);
    if (known !== undefined) return known;
    const layout = schema === undefined ? null : layoutOf(widened(schema));
    const inline = layout !== null && layout.kind === "linear" && layout.stride <= inlineInputBytes ? layout : null;
    inputLayouts.set(system, inline);
    return inline;
};

/** Whether a value has every field a struct input's schema names, so writing it into a slot loses nothing. */
export const fitsInline = (schema: Schema | undefined, value: unknown): boolean => {
    if (schema === undefined || !("type" in schema) || schema.type !== "object" || typeof value !== "object" || value === null) return false;
    for (const name of Object.keys(schema.properties)) if (!Object.hasOwn(value, name)) return false;
    return true;
};

/** Views of each slot's input, made once per buffer: the control words never move, and memory only grows. */
export const slotViews = (buffer: ArrayBufferLike, control: number): readonly Views[] =>
    Array.from({ length: runSlots }, (_, slot) => viewsOf(buffer, control + (slotsWord + slot * slotWords + slotPayload) * 4, inlineInputBytes));

/** The platform's Web Locks, where it has them, by which a thread that ends however it ends releases what it held. */
export const platformLocks = (): LockManager | null => globalThis.navigator?.locks ?? null;
