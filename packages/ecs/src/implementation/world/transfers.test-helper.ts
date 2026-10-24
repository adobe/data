// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { Schema } from "../../interface/schema/schema.js";

// Keys and systems every thread of the transfer tests imports: systems on thread "transfersTest", which a joined thread
// fills, and on the world's, taking Transferable values in their input, and `transfer` components holding them.
// An input field's schema `{ allOf: [] }` takes any value, typed `unknown`, which each body narrows.

export const anchor = Symbol("transfersTest/anchor");
export const order = Symbol("transfersTest/order");
export const port = Symbol("transfersTest/port");
export const bitmap = Symbol("transfersTest/bitmap");
export const portHere = Symbol("transfersTest/portHere");
export const bitmapHere = Symbol("transfersTest/bitmapHere");
export const parent = Symbol("transfersTest/parent");
export const depth = Symbol("transfersTest/depth");
declare module "@adobe/ecs" {
    export interface Threads {
        transfersTest: true;
    }
    export interface Components {
        [port]: { type: MessagePort; thread: "transfersTest"; transfer: true };
        [bitmap]: { type: ImageBitmap; thread: "transfersTest"; transfer: true };
        [portHere]: { type: MessagePort; transfer: true };
        [bitmapHere]: { type: ImageBitmap; transfer: true };
        [parent]: { type: Entity; reference: "owner" };
        [depth]: { type: number };
    }
    export interface Resources {
        [anchor]: { type: { readonly text: string }; thread: "transfersTest"; default: { text: "anchor" } };
        [order]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
    }
}
/** An object resource of "transfersTest", which places the systems reading it there. */
/** Counts the runs that read it, in the order they ran. */

const any = { allOf: [] } as const;

/** What a system was given, on the thread it ran on: an ArrayBuffer's length and first byte, and the run's order. */
export type Stored = { readonly bytes: number; readonly first: number; readonly order: number; readonly value: unknown };
export const stored: Stored[] = [];
/** The values systems gave components, on the thread they ran on. */
export const kept: unknown[] = [];

const store = (value: unknown, at: number): void => {
    const bytes = value instanceof ArrayBuffer ? value.byteLength : -1;
    stored.push({ bytes, first: bytes > 0 && value instanceof ArrayBuffer ? new Uint8Array(value)[0] : -1, order: at, value });
};

/** On "transfersTest": records the buffer it's given. */
export const storeThere = System.create({}, ({ resources }, input: { readonly buffer: unknown }) => {
    if (resources[anchor].text === "anchor") store(input.buffer, resources[order]++);
});
/** On the world's thread: records the buffer it's given. */
export const storeHere = System.create({}, ({ resources }, input: { readonly buffer: unknown }) => {
    store(input.buffer, resources[order]++);
});
/** On the world's thread: what a run from a joined thread saw of the order, by its value. */
export const marks: { readonly value: number; readonly order: number }[] = [];
export const mark = System.create({}, ({ resources }, input: { readonly value: number }) => {
    marks.push({ value: input.value, order: resources[order]++ });
});
/** On "transfersTest": gives an entity the port or bitmap it's given. */
export const attachThere = System.create({}, ({ resources, commands }, input: { readonly entity: Entity; readonly value: unknown }) => {
    if (resources[anchor].text !== "anchor") return;
    kept.push(input.value);
    if (input.value instanceof MessagePort) commands.add(input.entity, port, input.value);
    else if (typeof ImageBitmap === "function" && input.value instanceof ImageBitmap) commands.add(input.entity, bitmap, input.value);
});
/** On the world's thread: gives an entity the port or bitmap it's given. */
export const attachHere = System.create({}, ({ commands }, input: { readonly entity: Entity; readonly value: unknown }) => {
    kept.push(input.value);
    if (input.value instanceof MessagePort) commands.add(input.entity, portHere, input.value);
    else if (typeof ImageBitmap === "function" && input.value instanceof ImageBitmap) commands.add(input.entity, bitmapHere, input.value);
});
/** On "transfersTest": says hello through the port it's given, which only moving it there, not copying it, gives. */
export const greetThere = System.create({}, ({ resources }, input: { readonly port: unknown }) => {
    if (input.port instanceof MessagePort) input.port.postMessage(resources[anchor].text);
});

/** On the world's thread: spawns an entity holding the port it's given. */
export const spawnHere = System.create({}, ({ commands }, input: { readonly value: unknown }) => {
    if (input.value instanceof MessagePort) commands.spawn([portHere])({ [portHere]: input.value });
});

/**
 * On "transfersTest", declaring `up`, which runs only on the world's thread: once a joined thread fills
 * "transfersTest", it fails to register, so a run of it never runs.
 */
export const unregistered = System.create({
    components: { with: [port, depth] }, up: { through: parent },
}, (row, { up }, input: { readonly value: unknown }) => {
    row[depth] = (up === null ? 0 : up[depth]) + (row[port] === input.value ? 1 : 0);
});

/** On the world's thread: nothing, a run of its own. */
export const idle = System.create({}, () => {});

/** Every system the joined threads run or place, which they import so the world can place them there. */
export const transferSystems: readonly { readonly name: string }[] = [storeThere, storeHere, mark, attachThere, attachHere, spawnHere, greetThere, unregistered];
