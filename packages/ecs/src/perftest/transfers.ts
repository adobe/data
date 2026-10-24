// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld, type CreatedWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// A benchmark of transfers, in a browser: a loader on a joined worker moving decoded assets to the joined worker that
// claims "transfersBenchmark", whose system takes them, through runs. Both workers are `joined.ts`.

export const sink = Symbol("transfers/sink");
declare module "@adobe/ecs" {
    export interface Threads {
        transfersBenchmark: true;
    }
    export interface Resources {
        [sink]: { type: { readonly read: () => number } | null; thread: "transfersBenchmark" };
    }
}
/** An object of the claimed thread, which places the system reading it there. */

/** Bytes `take` took, on the claimed thread. */
export const taken = { bytes: 0 };

/** On the claimed thread: takes a buffer and a bitmap, as an upload would, closing the bitmap. */
export const take = System.create({
    resources: { read: [sink] },
}, ({ resources }, input: { readonly buffer: ArrayBuffer; readonly bitmap: ImageBitmap }) => {
    if (resources[sink] !== null) return;
    taken.bytes += input.buffer.byteLength + input.bitmap.width * input.bitmap.height * 4;
    input.bitmap.close();
});

/** Every system the joined threads run, which they import so the world can place them there. */
export const transferSystems: readonly { readonly name: string }[] = [take];

/** Transfers timed, in stretches of `transferBatch`, each made untimed first. */
export const transferCount = 100;
export const transferBatch = 10;
/** Each transfer's buffer bytes, and its bitmap's side in pixels. */
export const transferBytes = 1 << 20;
export const transferSide = 1024;

type Joined = { readonly ask: (message: unknown) => Promise<unknown>; readonly terminate: () => void };

/** Starts `joined.ts` on a browser worker, joining `world` through a channel it's given and claiming `threads`. */
const startJoined = async (world: CreatedWorld, threads: readonly string[]): Promise<Joined> => {
    const { port1, port2 } = new MessageChannel();
    world.share(port1);
    const worker = new Worker(new URL("./joined.js", import.meta.url), { type: "module" });
    const ask = (message: unknown, transfer: Transferable[] = []): Promise<unknown> => new Promise(resolve => {
        worker.onmessage = event => resolve(event.data);
        worker.postMessage(message, transfer);
    });
    await ask({ kind: "port", port: port2, threads }, [port2]);
    return { ask, terminate: () => worker.terminate() };
};

/** Milliseconds the loader took for `transferCount` transfers to the claimed thread, each run posted back to back in batches. */
const transfers = async (): Promise<number> => {
    const world = createWorld({ [workers]: 0 });
    const filler = await startJoined(world, ["transfersBenchmark"]);
    const loader = await startJoined(world, []);
    try {
        const reply = await loader.ask({ kind: "transfers" });
        if (typeof reply !== "object" || reply === null || Reflect.get(reply, "kind") !== "transferred") throw new Error("transfer: the loader didn't transfer.");
        const milliseconds: unknown = Reflect.get(reply, "milliseconds");
        return typeof milliseconds === "number" ? milliseconds : NaN;
    }
    finally {
        loader.terminate();
        filler.terminate();
        await world.dispose();
    }
};

export const transferBenchmarks: readonly Benchmark[] = [
    {
        name: "transfer",
        operation: "Runs from a loader on a joined worker, each moving a 1 MB ArrayBuffer and a 1024 by 1024 ImageBitmap to the joined worker whose system takes them, which acknowledges each to the world: decoded textures or audio reaching the thread that uses them.",
        per: "transfers",
        n: transferCount,
        typical: [1, 100],
        best: { bytes: 256, basis: "A transfer moves its values' handles in one message, the bytes staying where they are, and the run's slot and completion lines between cores." },
        run: () => transfers(),
    },
];
