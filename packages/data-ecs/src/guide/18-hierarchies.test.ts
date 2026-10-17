import { expect, it } from "vitest";
import { Component, Entity, System, World } from "../index.js";
import { toPromise } from "../observe/to-promise.js";

const offset = "guide/hierarchies/offset";
const position = "guide/hierarchies/position";
const parent = "guide/hierarchies/parent";

declare module "@adobe/data-ecs" {
    interface Components {
        [offset]: { type: number };
        [position]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
    }
}

Component.register(offset, { type: { type: "number" } });
Component.register(position, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });

// Each position is its parent's plus its own offset. Rows run parent first, so one run updates a whole tree.
const place = System.create({
    name: "guide/hierarchies/place",
    kernel: "cpu",
    components: { read: [offset], write: [position], changed: [offset] },
    up: { through: parent, read: [position] },
}, (row, { up }) => {
    row[position] = (up === null ? 0 : up[position]) + row[offset];
});

const parts: Entity[] = [];
const build = System.create({ name: "guide/hierarchies/build" }, ({ commands }) => {
    const body = commands.spawn({ [offset]: 1, [position]: 0 });
    const arm = commands.spawn({ [offset]: 2, [position]: 0, [parent]: body });
    parts.push(body, arm, commands.spawn({ [offset]: 3, [position]: 0, [parent]: arm }));
});
const move = System.create({ name: "guide/hierarchies/move", input: { type: "object", properties: { entity: Entity.schema } } }, ({ input, commands }) => {
    commands.add(input.entity, { [offset]: 10 });
});

it("flows values down a hierarchy, parent first, and again only where something changed", async () => {
    await using world = World.create();
    await world.run(build);
    await world.run(place);
    expect(await Promise.all(parts.map(async entity => (await toPromise(world.observe.entity(entity, { required: [position] })))?.[position]))).toEqual([1, 3, 6]);
    // Only the body's offset changed; its children pass because their parent's position did.
    await world.run(move, { entity: parts[0] });
    await world.run(place);
    expect(await Promise.all(parts.map(async entity => (await toPromise(world.observe.entity(entity, { required: [position] })))?.[position]))).toEqual([10, 12, 15]);
});
