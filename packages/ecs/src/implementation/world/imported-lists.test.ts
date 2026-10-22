import { expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { System } from "../../interface/system/system.js";
import { count, read, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { ember, marked, Spark } from "./imported-lists.test-helper.js";
import * as Lists from "./imported-lists.test-helper.js";
import { workers } from "../../interface/resources/workers.js";

const heat = Symbol("importedListsTest/heat");
declare module "@adobe/ecs" {
    export interface Components {
        [heat]: { type: number };
    }
}
Component.register(heat, { type: { type: "number" } });

const seed = System.create({ name: "importedListsTest/seed" }, ({ commands }) => {
    commands.spawn([heat])({ [heat]: 2 });
    commands.spawn([heat])({ [heat]: 5 });
});

/** Spawns and adds through lists another module declares, naming one of their keys only through the list. */
const ignite = System.create({ name: "importedListsTest/ignite", kernel: "cpu", components: { read: [heat] } }, (row, { commands }) => {
    commands.spawn(Spark)({ [ember]: row[heat] * 2 });
    commands.add(row.entity, Lists.Marks, { [ember]: row[heat] });
});

/** Declares an imported list, and removes through one. */
const cool = System.create({ name: "importedListsTest/cool", kernel: "cpu", components: { read: [ember], has: Lists.Spark } }, (row, { commands }) => {
    if (row[ember] > 4) commands.remove(row.entity, Spark);
});

it("kernels spawn, add, remove and declare through lists imported from another module", async () => {
    // Kernels run here: under Vitest's module runner, node workers can't load the sources.
    await using world = createWorld({ [workers]: 0 });
    await world.run(seed);
    await world.run(ignite);
    const sparks = await select(world, { required: Spark });
    expect((await Promise.all(sparks.map(entity => read(world, entity, ember)))).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([4, 10]);
    expect(await count(world, { required: [heat, ...Lists.Marks] })).toBe(2);
    await world.run(cool);
    expect(await count(world, { required: Spark })).toBe(1);
    expect(await count(world, { required: [marked] })).toBe(2);
});
