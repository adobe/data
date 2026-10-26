// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System } from "../../interface/system/system.js";
import type { Leaf } from "../../interface/system/leaf.js";
import { definitionOf } from "../../interface/registry/index.js";
import { claimSystem } from "../../interface/registry/program.js";
import { attachKernel, kernelOf } from "./attach-kernel.js";
import type { CreatedWorld, Tables } from "./create.js";

/**
 * What finishes V8's optimizing compiles in flight, where node runs with `--allow-natives-syntax`; null elsewhere. A
 * compile on a background thread holds the objects it read, systems among them, as roots until it's installed, which
 * a busy machine can put off past any number of collections.
 */
const compiles = (): (() => void) | null => {
    try {
        // A string, since `%` calls parse only with the flag, and not at all in TypeScript.
        const finish: unknown = new Function("%FinalizeOptimization();");
        return typeof finish === "function" ? () => { Reflect.apply(finish, undefined, []); } : null;
    }
    catch {
        return null;
    }
};

/**
 * The garbage collector, once optimizing compiles in flight are finished, where node runs with `--expose-gc` and
 * `--allow-natives-syntax`; null elsewhere, as in a browser.
 */
export const collector = (): (() => void) | null => {
    const gc: unknown = Reflect.get(globalThis, "gc");
    const finish = compiles();
    if (typeof gc !== "function" || finish === null) return null;
    return () => {
        finish();
        Reflect.apply(gc, undefined, []);
    };
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
    const copy: Leaf & System = { kind: leaf.kind, name: leaf.name, declaration: leaf.declaration, input: leaf.input, body: leaf.body };
    claimSystem(copy, undefined);
    return attachKernel(copy, description);
};
