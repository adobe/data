import type { System } from "../../interface/system/system.js";
import type { Leaf } from "../../interface/system/leaf.js";
import { definitionOf } from "../../interface/registry/index.js";
import { claimSystem } from "../../interface/registry/program.js";
import { attachKernel, kernelOf } from "./attach-kernel.js";
import type { CreatedWorld, Tables } from "./create.js";

/** The garbage collector, where node runs with `--expose-gc`; null elsewhere, as in a browser. */
export const collector = (): (() => void) | null => {
    const gc: unknown = Reflect.get(globalThis, "gc");
    return typeof gc === "function" ? () => { Reflect.apply(gc, undefined, []); } : null;
};

const task = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Collects garbage, then lets finalization callbacks run, a few times over, since a callback may release what the next
 * collection frees. Does nothing without a collector.
 */
export const collect = async (): Promise<void> => {
    const gc = collector();
    if (gc === null) return;
    for (let round = 0; round < 4; round++) {
        await task();
        gc();
    }
    await task();
};

/** The JS heap's used bytes after collecting, where node exposes the collector. */
export const heapAfterCollecting = async (): Promise<number> => {
    await collect();
    return process.memoryUsage().heapUsed;
};

/** A world's tables once garbage is collected. */
export const tablesAfterCollecting = async (world: CreatedWorld): Promise<Tables> => {
    await collect();
    return world.tables();
};

/**
 * A new value of a kernel system, with the same declaration, body and compiled kernel, as a module evaluated again
 * makes: the build compiles kernels only at module scope, so no other code makes one.
 */
export const freshKernel = (system: System): System => {
    const leaf = definitionOf(system);
    const description = kernelOf(system);
    if (leaf === undefined || leaf.kind === "composite" || description === undefined) throw new Error("Not a kernel system.");
    // What `System.create` makes of the same declaration and body, without the id a top-level binding takes.
    const copy: Leaf & System = { kind: leaf.kind, name: leaf.name, declaration: leaf.declaration, body: leaf.body };
    claimSystem(copy, undefined);
    return attachKernel(copy, description);
};
