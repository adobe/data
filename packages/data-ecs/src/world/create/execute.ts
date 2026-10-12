import type { Leaf } from '../../system/leaf.js';
import type { Chunk, Runner, Workers } from './runner.js';
import type { Schedule } from './schedule.js';
import type { Archetype, Storage } from './archetype.js';
import type { State } from './state.js';
import type { GpuEngine } from './gpu.js';
import { pending, synchronize } from './synchronize.js';

export type ExecuteContext = {
    readonly state: State;
    readonly runnerOf: (leaf: Leaf) => Runner;
    readonly kernelIndexOf: (runner: Runner) => number;
    readonly workers: Workers | null;
    /** Tells workers about layout changes; called after the sync point. */
    readonly publish: () => void;
};

/**
 * Runs a schedule tier by tier, then applies one sync point. Within a tier, kernels start first so workers
 * run while main-thread systems do; commands merge in tier order, then chunk order, whichever thread ran them.
 * A failing system rejects the run after its tier finishes; later tiers are skipped, and commands so far still apply.
 */
export const execute = async ({ state, runnerOf, kernelIndexOf, workers, publish }: ExecuteContext, schedule: Schedule, args: unknown): Promise<void> => {
    const { gpu } = state;
    const lost = gpu?.lost() ?? null;
    if (lost !== null) throw new Error(`The world's GPU device was lost: ${lost}`);
    try {
        for (const tier of schedule.tiers) {
            const runners = tier.map(runnerOf);
            if (gpu !== null) await readAhead(state, gpu, runners);
            const started: (readonly Chunk[])[] = new Array(runners.length);
            runners.forEach((runner, i) => {
                if (runner.kernel !== null) started[i] = runner.start(args, workers, kernelIndexOf(runner));
            });
            runners.forEach((runner, i) => {
                if (runner.kernel === null) started[i] = runner.start(args, null, -1);
            });
            // Every chunk settles, even a failed one, so no worker is still writing at the sync point.
            const results = await Promise.all(started.flat());
            let failure: { readonly error: unknown } | null = null;
            for (const { commands, error } of results) {
                // Systems can't touch the resource entity; only registration adds resources.
                if (commands.count > 0) state.queued.push({ buffer: commands, guarded: true });
                if (error !== undefined) failure ??= { error };
            }
            if (gpu !== null) markWrites(gpu, runners);
            if (failure !== null) throw failure.error;
        }
    }
    finally {
        try {
            if (gpu !== null) {
                gpu.submit();
                // The sync point moves and writes rows on the CPU, so it needs the GPU's writes first.
                if (gpu.anyAhead() && pending(state)) await gpu.readback();
            }
            try {
                synchronize(state);
            }
            finally {
                // Even a sync point that failed partway moved rows.
                if (gpu !== null && state.touched !== null) {
                    gpu.touched(state.touched);
                    state.touched.clear();
                }
            }
        }
        finally {
            publish();
        }
    }
};

/** Before CPU systems read or write a storage, in their query or through a lookup, the GPU's writes to it come back. */
const readAhead = async (state: State, gpu: GpuEngine, runners: readonly Runner[]): Promise<void> => {
    if (!gpu.anyAhead()) return;
    const storages = new Set<Storage>();
    const add = (archetype: Archetype, ids: readonly number[]): void => {
        for (const id of ids) {
            const storage = archetype.storageById[id];
            if (storage !== undefined && gpu.isAhead(storage)) storages.add(storage);
        }
    };
    for (const runner of runners) {
        if (runner.placement !== "cpu") continue;
        for (const archetype of runner.matched()) add(archetype, runner.touches);
        if (runner.looks.length > 0) for (const archetype of state.archetypes) add(archetype, runner.looks);
    }
    if (storages.size > 0) await gpu.readback([...storages]);
};

/** CPU writes make GPU copies out of date; GPU kernels mark their own writes as they dispatch. */
const markWrites = (gpu: GpuEngine, runners: readonly Runner[]): void => {
    for (const runner of runners) {
        if (runner.placement !== "cpu" || runner.writes.length === 0) continue;
        for (const archetype of runner.matched()) {
            for (const id of runner.writes) {
                const storage = archetype.storageById[id];
                if (storage !== undefined) gpu.markCpuWrites(archetype, storage);
            }
        }
    }
};
