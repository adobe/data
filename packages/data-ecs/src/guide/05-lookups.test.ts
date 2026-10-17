import { expect, it } from "vitest";
import { Component, Entity, System, Vec3, World } from "../index.js";
import { toPromise } from "../observe/to-promise.js";

const position = "guide/lookups/position";
const velocity = "guide/lookups/velocity";
const target = "guide/lookups/target";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [target]: { type: Entity };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(target, { type: Entity.schema });

const spawn = System.create({ name: "guide/lookups/spawn" }, ({ commands }) => {
    const leader = commands.spawn({ [position]: [10, 0, 0] });
    commands.spawn({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [target]: leader });
    commands.spawn({ [position]: [0, 0, 0], [velocity]: [0, 0, 0], [target]: Entity.none });
});

// A lookup reads another entity's components by id; it returns null for one that's missing or doesn't match.
const follow = System.create({
    name: "guide/lookups/follow",
    components: { read: [position, target], write: [velocity] },
    lookup: { targets: { read: [position] } },
}, (row, { lookup }) => {
    const other = lookup.targets(row[target]);
    row[velocity] = other === null ? [0, 0, 0] : Vec3.subtract(other[position], row[position]);
});

it("reads other entities through named lookups", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(follow);
    const entities = await toPromise(world.observe.select({ required: [velocity], order: { [velocity]: false } }));
    const velocities = await Promise.all(entities.map(async entity => (await toPromise(world.observe.entity(entity, { required: [velocity] })))?.[velocity]));
    expect(velocities).toEqual([[10, 0, 0], [0, 0, 0]]);
});
