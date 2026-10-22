// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TaskChannel } from './remote-systems.js';

// Transfers (threads.md, "Transfers"): a run's input holding Transferable values moves them to the thread its system
// runs on, a value whose command drops is released there, and a run's input held on that thread until its task.

/** Global constructors of Transferable values, where the platform has them. */
const constructors: readonly string[] = [
    "ArrayBuffer", "ImageBitmap", "OffscreenCanvas", "MessagePort", "VideoFrame", "AudioData",
    "ReadableStream", "WritableStream", "TransformStream", "RTCDataChannel",
];

/** This platform's constructors of Transferable values, found once. */
let found: readonly Function[] | null = null;
const platformConstructors = (): readonly Function[] => found ??= constructors.flatMap(name => {
    const constructor: unknown = Reflect.get(globalThis, name);
    return typeof constructor === "function" ? [constructor] : [];
});

/** Whether `value` is Transferable on this platform: a `SharedArrayBuffer` isn't, as it's shared rather than moved. */
export const isTransferable = (value: unknown): value is object => {
    if (typeof value !== "object" || value === null) return false;
    for (const constructor of platformConstructors()) if (value instanceof constructor) return true;
    return false;
};

const collect = (value: unknown, into: object[] | null): object[] | null => {
    if (!isTransferable(value) || into?.includes(value) === true) return into;
    (into ??= []).push(value);
    return into;
};

/**
 * The Transferable values a run's input holds, each once: its fields', and the elements of fields that are arrays; null
 * for none, which allocates nothing.
 */
export const transferablesOf = (input: unknown): object[] | null => {
    if (typeof input !== "object" || input === null) return null;
    let into: object[] | null = null;
    for (const field of Object.keys(input)) {
        const value: unknown = Reflect.get(input, field);
        if (Array.isArray(value)) {
            for (const element of value) if (typeof element === "object") into = collect(element, into);
        }
        else into = collect(value, into);
    }
    return into;
};

const ignore = (): void => {};

/** Calls a method of `value` by name, if it has one, ignoring what it throws or rejects with. */
const call = (value: object, method: string): void => {
    const callable: unknown = Reflect.get(value, method);
    if (typeof callable !== "function") return;
    try {
        const result: unknown = Reflect.apply(callable, value, []);
        if (result instanceof Promise) result.catch(ignore);
    }
    catch {
        // Released already, or locked: nothing more to release.
    }
};

/**
 * Releases a Transferable value no component will hold: closes an `ImageBitmap`, `VideoFrame`, `AudioData`,
 * `MessagePort` or `RTCDataChannel`, cancels a `ReadableStream`, aborts a `WritableStream`, and both for a
 * `TransformStream`'s sides. An `ArrayBuffer`'s and an `OffscreenCanvas`'s memory is the collector's.
 */
export const releaseValue = (value: unknown): void => {
    if (!isTransferable(value)) return;
    const name = value.constructor?.name;
    if (name === "ReadableStream") call(value, "cancel");
    else if (name === "WritableStream") call(value, "abort");
    else if (name === "TransformStream") {
        const readable: unknown = Reflect.get(value, "readable");
        const writable: unknown = Reflect.get(value, "writable");
        if (typeof readable === "object" && readable !== null) call(readable, "cancel");
        if (typeof writable === "object" && writable !== null) call(writable, "abort");
    }
    else call(value, "close");
};

/** Releases every Transferable value a run's input holds. */
export const releaseInput = (input: unknown): void => {
    for (const value of transferablesOf(input) ?? []) releaseValue(value);
};

/**
 * On the world's thread, a run's input held on the joined thread its system runs on, which moved it there: the joined
 * thread that ran it, by number, the run's sequence there, the channel of the thread holding it, and whether a task
 * there took it, so what none took is released once the run finishes.
 */
export type HeldInput = { readonly from: number; readonly sequence: number; readonly channel: TaskChannel; taken: boolean };

const held = new WeakSet<object>();

export const heldInput = (from: number, sequence: number, channel: TaskChannel): HeldInput => {
    const input: HeldInput = { from, sequence, channel, taken: false };
    held.add(input);
    return input;
};

/** Whether a run's input is held on a joined thread. */
export const isHeld = (input: unknown): input is HeldInput => typeof input === "object" && input !== null && held.has(input);
