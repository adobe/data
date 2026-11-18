// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type World } from "@adobe/ecs";
import {
    complexSystems, complexSystemsUpdate, createEntities, createHalfComponentEntities, createMixedUpdateEntities, createUpdateEntities, destroyEntities,
    destroyEntitiesWhere, probeEntities, probeFullEntities, removeAddComponent, systemsUpdate, unpackOneComponent, unpackThreeComponents, unpackTwoComponents,
} from "../../../cpu/model/index.js";
import { createGpuMixedUpdateEntities, createGpuUpdateEntities, gpuComplexSystemsUpdate, gpuSystemsUpdate } from "../../../gpu/model/index.js";
import { clearEntities } from "./constant.scenarios/system.clear-entities.js";

/** The suite's benchmarks, by their names there, each measured as an app pays for it: a run, its sync points included. */
export const scenarios: readonly Scenario[] = [
    { name: "BM_SystemsUpdate", measure: (create, count) => frames(create(), world => world.run(createUpdateEntities, { count }), world => world.run(systemsUpdate)) },
    { name: "BM_SystemsUpdateMixedEntities", measure: (create, count) => frames(create(), world => world.run(createMixedUpdateEntities, { count }), world => world.run(systemsUpdate)) },
    { name: "BM_ComplexSystemsUpdate", measure: (create, count) => frames(create(), world => world.run(createUpdateEntities, { count }), world => world.run(complexSystemsUpdate)) },
    { name: "BM_ComplexSystemsUpdateMixedEntities", measure: (create, count) => frames(create(), world => world.run(createMixedUpdateEntities, { count }), world => world.run(complexSystemsUpdate)) },
    {
        name: "BM_CreateEntities",
        // A run of no entities first, so the timed run is the spawns and their sync point.
        measure: (create, count) => measureWorlds(create, world => world.run(createEntities, { count: 0 }), world => world.run(createEntities, { count })),
    },
    {
        name: "BM_DestroyEntities",
        // A destroy of as many first, so the pool's workers have started and loaded the kernel before the timed one.
        measure: (create, count) => measureWorlds(create, async world => {
            await world.run(createEntities, { count });
            await world.run(destroyEntities);
            await world.run(createEntities, { count });
        }, world => world.run(destroyEntities)),
    },
    {
        name: "Ours_DestroyEntitiesWhere",
        // BM_DestroyEntities's entities despawned by one query, which empties their archetype whole.
        measure: (create, count) => measureWorlds(create, async world => {
            await world.run(createEntities, { count });
            await world.run(destroyEntitiesWhere);
            await world.run(createEntities, { count });
        }, world => world.run(destroyEntitiesWhere)),
    },
    { name: "BM_UnpackOneComponent", measure: (create, count) => gets(create(), world => world.run(createEntities, { count }), world => world.run(probeEntities), world => world.run(unpackOneComponent)) },
    { name: "BM_UnpackTwoComponents", measure: (create, count) => gets(create(), world => world.run(createEntities, { count }), world => world.run(probeEntities), world => world.run(unpackTwoComponents)) },
    { name: "BM_UnpackThreeComponents", measure: (create, count) => gets(create(), world => world.run(createHalfComponentEntities, { count }), world => world.run(probeFullEntities), world => world.run(unpackThreeComponents)) },
    { name: "BM_RemoveAddComponent", measure: (create, count) => frames(create(), world => world.run(createEntities, { count }), world => world.run(removeAddComponent)) },
    // A frame of the 7-system benchmarks' systems up to each but the last, as the C++ runs them with
    // ECS_BENCHMARK_SYSTEMS: one less the one before is what the system costs as a frame runs it, the data in the
    // state the systems before it leave.
    ...(["BM_ComplexSystemsUpdate", "BM_ComplexSystemsUpdateMixedEntities"] as const).flatMap(benchmark => complexSystems.slice(0, -1).map(([name], k): Scenario => {
        const through = System.create(complexSystems.slice(0, k + 1).map(([, system]) => system));
        const setup = benchmark === "BM_ComplexSystemsUpdate" ? createUpdateEntities : createMixedUpdateEntities;
        return { name: `${benchmark}_Through_${name}`, measure: (create, count) => frames(create(), world => world.run(setup, { count }), world => world.run(through)) };
    })),
    // The frames as GPU kernels, their data's `dingy` an f32, each sample timed until the GPU has done its frames: on
    // the `gpu` lane, and for comparison on the CPU, where GPU kernels run as kernels.
    { name: "GPU_SystemsUpdate", measure: (create, count, settle) => frames(create(), world => world.run(createGpuUpdateEntities, { count }), world => world.run(gpuSystemsUpdate), settle) },
    { name: "GPU_SystemsUpdateMixedEntities", measure: (create, count, settle) => frames(create(), world => world.run(createGpuMixedUpdateEntities, { count }), world => world.run(gpuSystemsUpdate), settle) },
    { name: "GPU_ComplexSystemsUpdate", measure: (create, count, settle) => frames(create(), world => world.run(createGpuUpdateEntities, { count }), world => world.run(gpuComplexSystemsUpdate), settle) },
    {
        name: "GPU_ComplexSystemsUpdateMixedEntities",
        measure: (create, count, settle) => frames(create(), world => world.run(createGpuMixedUpdateEntities, { count }), world => world.run(gpuComplexSystemsUpdate), settle),
    },
];

/**
 * A run per frame, timed after `setup`, ten frames a sample: every entity's `thingy` steps together, so
 * `MoreComplexSystem` draws new directions for all of them on one frame in ten.
 */
const frames = (world: World, setup: (world: World) => Promise<unknown>, frame: (world: World) => Promise<unknown>, settle?: () => Promise<void>) =>
    measureRuns(world, () => setup(world), () => frame(world), 10, settle);

/** Gets through probes, one for each entity the setup made, in their order. */
const gets = (world: World, setup: (world: World) => Promise<unknown>, probe: (world: World) => Promise<unknown>, get: (world: World) => Promise<unknown>) =>
    measureRuns(world, async () => {
        await setup(world);
        await probe(world);
    }, () => get(world));

/**
 * How a benchmark warms up and is timed. On one world: at least `warmUp` milliseconds and `warmUpRuns` runs, enough for
 * V8 to optimize the bodies, tier WASM up from its baseline compiler and start the pool's workers, then after setting
 * up again `settleRuns` runs, which bring the pool's cores back up to speed, then `samples` timed samples. On new worlds: `warmUpWorlds` first, then at least `timedRuns` and `timed` milliseconds, up to
 * `maximumWorlds`.
 */
const budget = { warmUp: 1000, warmUpRuns: 50, settleRuns: 200, samples: 30, warmUpWorlds: 3, timed: 1000, timedRuns: 10, maximumWorlds: 30 } as const;

/** A benchmark's times, in nanoseconds per run: every timed run's, sorted. */
type Sample = { readonly times: readonly number[] };

/**
 * Times `run` on one world after `setup`, as an app's frames run: warmed up for at least `budget.warmUp` milliseconds
 * and `budget.warmUpRuns` runs, so V8 has optimized the bodies, tiered WASM up and started the pool's workers; then
 * set up again from no entities and run `budget.settleRuns` times, which brings the pool's cores back up to speed
 * after setting up; then timed `batch` runs at a time for `budget.samples` samples, each their mean. The entities'
 * data moves on with each run and decides how much work a run does, so every measurement times the same states from
 * the same start, however many runs warming up took. A batch ends once `settle` resolves, after the GPU has done what
 * its runs gave it, so a sample times their work done, its frames given to the GPU one after another as an app's are.
 */
const measureRuns = async (world: World, setup: () => Promise<unknown>, run: () => Promise<unknown>, batch = 1, settle: () => Promise<void> = async () => {}): Promise<Sample> => {
    try {
        await setup();
        const warmUpEnd = performance.now() + budget.warmUp;
        for (let i = 0; i < budget.warmUpRuns || performance.now() < warmUpEnd; i++) await run();
        await world.run(clearEntities);
        await setup();
        for (let i = 0; i < budget.settleRuns; i++) await run();
        await settle();
        const times: number[] = [];
        for (let sample = 0; sample < budget.samples; sample++) {
            const start = performance.now();
            for (let i = 0; i < batch; i++) await run();
            await settle();
            times.push(((performance.now() - start) / batch) * 1e6);
        }
        return { times: times.sort((a, b) => a - b) };
    }
    finally {
        await world.dispose();
    }
};

/**
 * Times `run` once on each of a series of new worlds, after `setup` on each, as the suite times each iteration on a
 * new registry. The first `budget.warmUpWorlds` warm up.
 */
const measureWorlds = async (create: () => World, setup: (world: World) => Promise<unknown>, run: (world: World) => Promise<unknown>): Promise<Sample> => {
    const times: number[] = [];
    let total = 0;
    for (let i = 0; i < budget.warmUpWorlds + budget.timedRuns || (total < budget.timed && i < budget.warmUpWorlds + budget.maximumWorlds); i++) {
        const world = create();
        try {
            await setup(world);
            const start = performance.now();
            await run(world);
            const elapsed = performance.now() - start;
            if (i < budget.warmUpWorlds) continue;
            total += elapsed;
            times.push(elapsed * 1e6);
        }
        finally {
            await world.dispose();
        }
    }
    return { times: times.sort((a, b) => a - b) };
};

/**
 * A benchmark of the suite, by its name there, measured at a count of entities on worlds `create` makes; `settle`
 * resolves once the GPU has done what a frame gave it.
 */
type Scenario = { readonly name: string; readonly measure: (create: () => World, count: number, settle: () => Promise<void>) => Promise<Sample> };
