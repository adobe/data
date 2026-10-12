import type { Leaf } from '../../system/leaf.js';
import type { Chunk, Runner, Workers } from './runner.js';
import type { Schedule } from './schedule.js';
import type { Archetype, Storage } from './archetype.js';
import type { State } from './state.js';
import type { GpuEngine } from './gpu.js';
import { pending, synchronize } from './synchronize.js';
import { spawnCommand } from './buffer.js';
import { locate } from './entities.js';

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
export const execute = async (context: ExecuteContext, schedule: Schedule, args: unknown): Promise<void> => {
    const { gpu } = context.state;
    if (gpu === null) return executeTiers(context, schedule, args);
    const lost = gpu.lost();
    if (lost !== null) throw new Error(`The world's GPU device was lost: ${lost}`);
    const earlier = gpu.takeError();
    if (earlier !== null) throw new Error(`An earlier run's GPU work failed: ${earlier}`);
    // The run's GPU work, its render bodies' included, reports its errors to the next run: waiting for them here would
    // hold every run until the GPU process catches up.
    gpu.device.pushErrorScope("out-of-memory");
    gpu.device.pushErrorScope("validation");
    try {
        await executeTiers(context, schedule, args);
    }
    finally {
        gpu.reportErrors(gpu.device.popErrorScope(), gpu.device.popErrorScope());
    }
};

const executeTiers = async ({ state, runnerOf, kernelIndexOf, workers, publish }: ExecuteContext, schedule: Schedule, args: unknown): Promise<void> => {
    const { gpu } = state;
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
                if (pending(state)) {
                    // The sync point moves and writes existing rows of these archetypes on the CPU, so it needs the GPU's writes there first.
                    const disturbed = disturbedBy(state);
                    gpu.beforeSync(disturbed);
                    if (gpu.anyAhead()) await gpu.readback([...disturbed].flatMap(archetype => archetype.storages));
                }
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

/**
 * Archetypes whose existing rows the next sync point moves or writes: those of live entities that queued commands
 * despawn, add to or remove from. Spawns only add rows at the end of their archetypes.
 */
const disturbedBy = (state: State): Set<Archetype> => {
    const disturbed = new Set<Archetype>();
    for (const { buffer } of state.queued) {
        for (let command = 0; command < buffer.count; command++) {
            if (buffer.kinds[command] === spawnCommand) continue;
            const index = locate(state.entities, buffer.entities[command]);
            if (index >= 0) disturbed.add(state.archetypes[state.entities.archetype[index]]);
        }
    }
    return disturbed;
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
