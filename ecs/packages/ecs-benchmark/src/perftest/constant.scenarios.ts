// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, type World } from "@adobe/ecs";
import {
    complexSystems, complexSystemsUpdate, createEntities, createHalfComponentEntities, createMixedUpdateEntities, createUpdateEntities,
    destroyEntities, destroyEntitiesWhere, probeEntities, probeFullEntities, removeAddComponent, systemsUpdate, unpackOneComponent,
    unpackThreeComponents, unpackTwoComponents,
} from "../scenarios/model/index.js";
import { measureRuns } from "./function.measure-runs.js";
import { measureWorlds } from "./function.measure-worlds.js";
import type { Scenario } from "./type.scenario.js";

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
    // A frame of `BM_ComplexSystemsUpdateMixedEntities`'s systems up to each, which the suite doesn't time: one less
    // another is what the system costs as a frame runs it, the data in the state the systems before it leave.
    ...complexSystems.map(([name], k): Scenario => {
        const through = System.create(complexSystems.slice(0, k + 1).map(([, system]) => system));
        return { name: `Ours_ComplexMixed_Through_${name}`, measure: (create, count) => frames(create(), world => world.run(createMixedUpdateEntities, { count }), world => world.run(through)) };
    }),
];

/**
 * A run per frame, timed after `setup`, ten frames a sample: every entity's `thingy` steps together, so
 * `MoreComplexSystem` draws new directions for all of them on one frame in ten.
 */
const frames = (world: World, setup: (world: World) => Promise<unknown>, frame: (world: World) => Promise<unknown>) =>
    measureRuns(world, () => setup(world), () => frame(world), 10);

/** Gets through probes, one for each entity the setup made, in their order. */
const gets = (world: World, setup: (world: World) => Promise<unknown>, probe: (world: World) => Promise<unknown>, get: (world: World) => Promise<unknown>) =>
    measureRuns(world, async () => {
        await setup(world);
        await probe(world);
    }, () => get(world));
