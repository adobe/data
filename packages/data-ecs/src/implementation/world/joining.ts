import type { Port } from '../../interface/world/join.js';
import type { Report } from '../../interface/world/report.js';
import type { Schema } from '../../interface/schema/schema.js';
import { layoutOf, viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { lineWords } from './protocol.js';

// What a world's thread and a thread that joined it share: their messages, the joined thread's control words and run
// slots in shared memory, and how a run's input is written into a slot.

/** Marks this channel's messages, so a port that carries others too, such as a worker's scope, can share it. */
export const protocolName = "@adobe/data-ecs/join@1";

/**
 * What a joined thread observes, naming keys by its own numbers: a resource; an entity's listed components; an entity's
 * whole value, of the struct components it had registered when it subscribed; or a query.
 */
export type Subscription =
    | { readonly kind: "resource"; readonly key: number }
    | { readonly kind: "entity"; readonly entity: number; readonly required: readonly number[]; readonly optional: readonly number[] }
    | { readonly kind: "whole"; readonly entity: number; readonly known: readonly number[] }
    | {
        readonly kind: "select" | "count";
        readonly required: readonly number[];
        readonly not: readonly number[];
        readonly where: readonly (readonly [number, unknown])[];
        readonly order: readonly (readonly [number, boolean])[];
        readonly page: { readonly offset: number; readonly limit: number } | null;
    };

/** From a joined thread to the world's: messages are handled in the order they're posted. */
export type ToWorld = { readonly protocol: typeof protocolName } & (
    /**
     * First: the logical threads it claims; whether it can wait without blocking, so it's woken without a message; and
     * the name of a Web Lock it holds while it lives, where the platform has them, which the world then requests, so
     * it's granted when the thread ends however it ends.
     */
    | { readonly kind: "join"; readonly threads: readonly string[]; readonly waits: boolean; readonly lock: string | null }
    /** The id of a key or system it numbers `number`, posted before the first use of that number. */
    | { readonly kind: "name"; readonly number: number; readonly id: string; readonly item: boolean }
    /** The input of run `sequence`, which its slot says comes by message. */
    | { readonly kind: "input"; readonly sequence: number; readonly input: unknown }
    | { readonly kind: "observe"; readonly observer: number; readonly subscription: Subscription }
    | { readonly kind: "unobserve"; readonly observer: number }
    /** Where the world can't wait without blocking: runs were posted. */
    | { readonly kind: "wake" }
    | { readonly kind: "leave" }
);

/** From the world's thread to a joined one. */
export type ToJoined = { readonly protocol: typeof protocolName } & (
    /** The memory, and the byte offset of the thread's control words; whether the world can wait without blocking. */
    | { readonly kind: "joined"; readonly memory: WebAssembly.Memory; readonly control: number; readonly waits: boolean }
    | { readonly kind: "refused"; readonly message: string }
    /** The report of run `sequence`, posted only when it isn't clean. */
    | { readonly kind: "report"; readonly sequence: number; readonly report: Report }
    | { readonly kind: "rejected"; readonly sequence: number; readonly message: string }
    /** The byte offset of an observer's mailbox (`mailbox.ts`). */
    | { readonly kind: "mailbox"; readonly observer: number; readonly offset: number }
    /** Where the joined thread can't wait without blocking: runs completed or observers have values. */
    | { readonly kind: "wake" }
    | { readonly kind: "disposed" }
);

/** A joined thread's channel to the world, or the world's to it, over the port it was given. */
export type ThreadChannel<Send, Receive> = {
    readonly post: (message: Send) => void;
    /** Sets the one handler for this protocol's messages; others are ignored. */
    readonly onMessage: (handler: (message: Receive) => void) => void;
    /** Sets the one handler for the other end's end: a `MessagePort`'s close, or a node worker's exit. */
    readonly onClose: (handler: () => void) => void;
    /** Closes a `MessagePort`; a worker or a worker's scope stays as it is, its owner's to end. */
    readonly close: () => void;
};

const isOurs = (data: unknown): boolean => typeof data === "object" && data !== null && Reflect.get(data, "protocol") === protocolName;

/**
 * A port as a channel: a browser `MessagePort`, `Worker` or worker scope through `addEventListener`, and a node
 * `MessagePort`, `Worker` or `parentPort` through `on`.
 */
export const threadChannel = <Send, Receive>(port: Port): ThreadChannel<Send, Receive> => {
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
        post: message => { if (typeof postMessage === "function") Reflect.apply(postMessage, port, [message]); },
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
        close: () => { if (typeof close === "function" && typeof Reflect.get(port, "terminate") !== "function") Reflect.apply(close, port, []); },
    };
};

/**
 * A joined thread's control words, each on a line of its own: the signal it waits on, which the world bumps when runs
 * complete or observers have values, beside whether a wake is unread, which the thread clears before it reads what's
 * new, so the world notifies only a thread that has read every earlier wake; the last run it posted; and the last run
 * the world completed. Then its run slots.
 */
export const signalWord = 0;
export const unreadWord = 1;
export const postedWord = lineWords;
export const completedWord = 2 * lineWords;
export const slotsWord = 3 * lineWords;

/**
 * Runs in flight a joined thread holds room for, each in slot `(sequence - 1) % runSlots`: its status, which the world
 * writes before completing it, the system's number, its sequence and its input's length in bytes, then the input.
 */
export const runSlots = 64;
export const slotWords = 64;
export const slotStatus = 0;
export const slotNumber = 1;
export const slotSequence = 2;
export const slotInput = 3;
export const slotPayload = 4;
export const controlBytes = (slotsWord + runSlots * slotWords) * 4;
/** Input written in its slot, at most this many bytes. */
export const inlineInputBytes = (slotWords - slotPayload) * 4;
/** A slot's input length for none, and for an input posted as a message. */
export const noInput = -1;
export const inputByMessage = -2;
/** A slot's system number for a run whose input couldn't be posted, which the world completes without running. */
export const unposted = -1;
/** Slot statuses: in flight; done with a clean report; done with a report or a rejection, posted. */
export const pending = 0;
export const clean = 1;
export const reported = 2;
export const rejected = 3;

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
