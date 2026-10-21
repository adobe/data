import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";

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
declare module "@adobe/data-ecs" {
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
        [anchor]: { type: { readonly text: string }; thread: "transfersTest" };
        [order]: { type: number };
    }
}
/** An object resource of "transfersTest", which places the systems reading it there. */
Resource.register(anchor, { type: { type: "object", properties: { text: { type: "string" } }, default: { text: "anchor" } }, thread: "transfersTest" });
/** Counts the runs that read it, in the order they ran. */
Resource.register(order, { type: { type: "integer", default: 0 } });
Component.register(port, { thread: "transfersTest", transfer: true });
Component.register(bitmap, { thread: "transfersTest", transfer: true });
Component.register(portHere, { transfer: true });
Component.register(bitmapHere, { transfer: true });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(depth, { type: { type: "number" } });

const any = { allOf: [] } as const;

/** What a system was given, on the thread it ran on: an ArrayBuffer's length and first byte, and the run's order. */
export type Stored = { readonly bytes: number; readonly first: number; readonly order: number; readonly value: unknown };
export const stored: Stored[] = [];
/** The values systems gave components, on the thread they ran on. */
export const kept: unknown[] = [];

const store = (value: unknown, resources: { [order]: number }): void => {
    const bytes = value instanceof ArrayBuffer ? value.byteLength : -1;
    stored.push({ bytes, first: bytes > 0 && value instanceof ArrayBuffer ? new Uint8Array(value)[0] : -1, order: resources[order]++, value });
};

/** On "transfersTest": records the buffer it's given. */
export const storeThere = System.create({ name: "transfersTest/storeThere", input: { type: "object", properties: { buffer: any } }, resources: { read: [anchor], write: [order] } }, ({ input, resources }) => {
    if (resources[anchor].text === "anchor") store(input.buffer, resources);
});
/** On the world's thread: records the buffer it's given. */
export const storeHere = System.create({ name: "transfersTest/storeHere", input: { type: "object", properties: { buffer: any } }, resources: { write: [order] } }, ({ input, resources }) => {
    store(input.buffer, resources);
});
/** On the world's thread: what a run from a joined thread saw of the order, by its value. */
export const marks: { readonly value: number; readonly order: number }[] = [];
export const mark = System.create({ name: "transfersTest/mark", input: { type: "object", properties: { value: { type: "number" } } }, resources: { write: [order] } }, ({ input, resources }) => {
    marks.push({ value: input.value, order: resources[order]++ });
});
/** On "transfersTest": gives an entity the port or bitmap it's given. */
export const attachThere = System.create({
    name: "transfersTest/attachThere", input: { type: "object", properties: { entity: Entity.schema, value: any } }, resources: { read: [anchor] },
}, ({ input, resources, commands }) => {
    if (resources[anchor].text !== "anchor") return;
    kept.push(input.value);
    if (input.value instanceof MessagePort) commands.add(input.entity, port, input.value);
    else if (typeof ImageBitmap === "function" && input.value instanceof ImageBitmap) commands.add(input.entity, bitmap, input.value);
});
/** On the world's thread: gives an entity the port or bitmap it's given. */
export const attachHere = System.create({ name: "transfersTest/attachHere", input: { type: "object", properties: { entity: Entity.schema, value: any } } }, ({ input, commands }) => {
    kept.push(input.value);
    if (input.value instanceof MessagePort) commands.add(input.entity, portHere, input.value);
    else if (typeof ImageBitmap === "function" && input.value instanceof ImageBitmap) commands.add(input.entity, bitmapHere, input.value);
});
/** On "transfersTest": says hello through the port it's given, which only moving it there, not copying it, gives. */
export const greetThere = System.create({ name: "transfersTest/greetThere", input: { type: "object", properties: { port: any } }, resources: { read: [anchor] } }, ({ input, resources }) => {
    if (input.port instanceof MessagePort) input.port.postMessage(resources[anchor].text);
});

/** On the world's thread: spawns an entity holding the port it's given. */
export const spawnHere = System.create({ name: "transfersTest/spawnHere", input: { type: "object", properties: { value: any } } }, ({ input, commands }) => {
    if (input.value instanceof MessagePort) commands.spawn([portHere])({ [portHere]: input.value });
});

/**
 * On "transfersTest", declaring `up`, which runs only on the world's thread: once a joined thread fills
 * "transfersTest", it fails to register, so a run of it never runs.
 */
export const unregistered = System.create({
    name: "transfersTest/unregistered", input: { type: "object", properties: { value: any } }, components: { read: [port], write: [depth] }, up: { through: parent, read: [depth] },
}, (row, { input, up }) => {
    row[depth] = (up === null ? 0 : up[depth]) + (row[port] === input.value ? 1 : 0);
});

/** On the world's thread: nothing, a run of its own. */
export const idle = System.create({ name: "transfersTest/idle" }, () => {});

/** Every system the joined threads run or place, which they import so the world can place them there. */
export const transferSystems: readonly { readonly name: string }[] = [storeThere, storeHere, mark, attachThere, attachHere, spawnHere, greetThere, unregistered];
