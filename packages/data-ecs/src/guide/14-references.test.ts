import { expect, it } from "vitest";
import { Component, Entity, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const node = "guide/references/node";
const parent = "guide/references/parent";
const watching = "guide/references/watching";

declare module "@adobe/data-ecs" {
    interface Components {
        [node]: { type: string };
        [parent]: { type: Entity; reference: "owner" };
        [watching]: { type: Entity; reference: "weak" };
    }
}

Component.register(node, { type: { type: "string" } });
// When the target despawns, an `owner` reference despawns its holder, and a `weak` one is removed from it.
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(watching, { type: Entity.schema, reference: "weak" });

const spawn = System.create({ name: "guide/references/spawn" }, ({ commands }) => {
    const root = commands.spawn({ [node]: "root" });
    const child = commands.spawn({ [node]: "child", [parent]: root });
    commands.spawn({ [node]: "grandchild", [parent]: child });
    commands.spawn({ [node]: "camera", [watching]: child });
});
const prune = System.create({ name: "guide/references/prune", components: { read: [node] } }, (row, { commands }) => {
    if (row[node] === "root") commands.despawn(row.entity);
});

it("despawns owned entities with their owner, transitively, and drops weak references", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(prune);
    const nodes = await toPromise(world.observe.select({ required: [node] }));
    expect(await Promise.all(nodes.map(async entity => (await toPromise(world.observe.entity(entity, { required: [node] })))?.[node]))).toEqual(["camera"]);
    expect(await toPromise(world.observe.count({ required: [watching] }))).toBe(0);
});
