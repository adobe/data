import type { Leaf } from '../../system/leaf.js';
import type { Chunk, Runner, Workers } from './runner.js';
import type { Schedule } from './schedule.js';
import type { State } from './state.js';
import { synchronize } from './synchronize.js';

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
    try {
        for (const tier of schedule.tiers) {
            const runners = tier.map(runnerOf);
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
                for (const command of commands) if (command.entity !== state.resourceEntity) state.commands.push(command);
                if (error !== undefined) failure ??= { error };
            }
            if (failure !== null) throw failure.error;
        }
    }
    finally {
        try {
            synchronize(state);
        }
        finally {
            publish();
        }
    }
};
