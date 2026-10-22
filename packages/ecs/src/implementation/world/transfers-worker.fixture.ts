import type { MessagePort as NodeMessagePort } from "node:worker_threads";
import { requireDefinition } from "../../interface/registry/index.js";
import type { World } from "../../interface/world/world.js";
import { join } from "./create.js";
import { asEntity } from "./entities.js";
import { peersOf } from "./join.js";
import { scopeChannel } from "./port.js";
import { attachHere, attachThere, greetThere, kept, mark, storeThere, stored, transferSystems } from "./transfers.test-helper.js";

/**
 * A thread joining a world through the port it's sent: the filler claims "transfersTest", whose systems run here, and
 * the loader claims nothing and runs systems with Transferable input, moving it to their threads. The filler blocks
 * its event loop when asked, until the asker sets the word it gave, so what the loader moves there waits to be received.
 */

type Port = MessagePort | NodeMessagePort;
export type ToTransfersWorker =
    | { readonly kind: "join"; readonly port: Port; readonly threads: readonly "transfersTest"[] }
    | { readonly kind: "block"; readonly word: Int32Array<SharedArrayBuffer> }
    | { readonly kind: "stored" }
    | { readonly kind: "moves"; readonly count: number; readonly bytes: number }
    | { readonly kind: "late" }
    | { readonly kind: "settled" }
    | { readonly kind: "drops" };
export type FromTransfersWorker =
    | { readonly kind: "joined" }
    | { readonly kind: "blocking" }
    | { readonly kind: "stored"; readonly stored: readonly (readonly [number, number, number])[]; readonly widths: readonly number[] }
    | { readonly kind: "moved"; readonly detached: number; readonly greeted: unknown; readonly runs: readonly number[] }
    | { readonly kind: "posted"; readonly detached: boolean }
    | { readonly kind: "settled"; readonly runs: readonly number[] }
    | { readonly kind: "dropped"; readonly runs: readonly number[]; readonly closed: boolean; readonly widths: readonly number[] };

const channel = scopeChannel<FromTransfersWorker, ToTransfersWorker>();
let remote: World | null = null;
let posted: Promise<number>[] = [];

const later = (milliseconds = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

const bufferOf = (first: number, bytes: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(bytes);
    new Uint8Array(buffer)[0] = first;
    return buffer;
};

/** Resolves once a port's other end closed, or with false after `milliseconds`. */
const closed = (port: MessagePort, milliseconds = 20000): Promise<boolean> => new Promise(resolve => {
    port.addEventListener("close", () => resolve(true));
    port.start();
    setTimeout(() => resolve(false), milliseconds);
});

/** A bitmap, where the platform has them: a browser's. */
const bitmap = async (): Promise<ImageBitmap | null> =>
    typeof createImageBitmap === "function" ? createImageBitmap(new ImageData(4, 4)) : null;

const respond = async (message: Exclude<ToTransfersWorker, { readonly kind: "block" }>): Promise<FromTransfersWorker> => {
    if (message.kind === "join") {
        for (const system of transferSystems) requireDefinition(system);
        remote = join(message.port, { threads: message.threads });
        // Joined once the world gave it a channel to the other joined thread.
        while ((peersOf.get(remote)?.() ?? 0) === 0) await later(1);
        return { kind: "joined" };
    }
    if (message.kind === "stored") {
        return { kind: "stored", stored: stored.map(({ bytes, first, order }) => [bytes, first, order]), widths: kept.map(value => typeof ImageBitmap === "function" && value instanceof ImageBitmap ? value.width : -1) };
    }
    if (remote === null) throw new Error("transfers: the worker hasn't joined.");
    const world = remote;
    if (message.kind === "moves") {
        const buffers = Array.from({ length: message.count }, (_, k) => bufferOf(k + 1, message.bytes));
        const runs = buffers.map(buffer => world.run(storeThere, { buffer }));
        const detached = buffers.filter(buffer => buffer.byteLength === 0).length;
        const ports = new MessageChannel();
        const greeted = new Promise<unknown>(resolve => {
            ports.port2.onmessage = event => resolve(event.data);
        });
        runs.push(world.run(greetThere, { port: ports.port1 }));
        const numbers = await Promise.all(runs);
        const greeting = await greeted;
        ports.port2.close();
        return { kind: "moved", detached, greeted: greeting, runs: numbers };
    }
    if (message.kind === "late") {
        const buffer = bufferOf(9, 1 << 20);
        posted = [world.run(storeThere, { buffer }), world.run(mark, { value: 1 }), world.run(mark, { value: 2 }), world.run(mark, { value: 3 })];
        return { kind: "posted", detached: buffer.byteLength === 0 };
    }
    if (message.kind === "settled") {
        return { kind: "settled", runs: await Promise.all(posted) };
    }
    // Commands giving a dead entity values: they drop, and each value is released on its thread.
    const dead = asEntity(123456);
    const ports = new MessageChannel();
    const closing = closed(ports.port2);
    const runs = [await world.run(attachThere, { entity: dead, value: ports.port1 })];
    const there = await bitmap();
    const here = await bitmap();
    if (there !== null && here !== null) {
        runs.push(await world.run(attachThere, { entity: dead, value: there }));
        runs.push(await world.run(attachHere, { entity: dead, value: here }));
    }
    // Moved, so detached here: zero wide.
    const widths = there === null || here === null ? [] : [there.width, here.width];
    return { kind: "dropped", runs, closed: await closing, widths };
};

channel.onMessage(async message => {
    if ("protocol" in message) return;
    if (message.kind !== "block") return channel.post(await respond(message));
    // The reply goes out first; then this thread's event loop is blocked until the asker sets the word.
    channel.post({ kind: "blocking" });
    Atomics.wait(message.word, 0, 0);
});
