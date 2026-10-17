import { Component } from "../types/component/component.js";
import { Entity } from "../types/entity/entity.js";
import { System } from "../types/system/system.js";

export const local = "hierarchy/local";
export const world = "hierarchy/world";
export const parent = "hierarchy/parent";
export const leaf = "hierarchy/leaf";

declare module "@adobe/data-ecs" {
    export interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [leaf]: { type: true };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(world, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(leaf, { type: { const: true } });

/** Each row's world value is its parent's plus its own. */
export const propagate = System.create({
    name: "hierarchy/propagate",
    kernel: "cpu",
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** The same, only for rows whose own or parent's values changed since it last ran. */
export const propagateChanged = System.create({
    name: "hierarchy/propagateChanged",
    kernel: "cpu",
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** `roots` chains of `depth` rows each. */
export const forest = System.create({
    name: "hierarchy/forest",
    input: { type: "object", properties: { roots: { type: "integer" }, depth: { type: "integer" } } },
}, ({ input, commands }) => {
    for (let r = 0; r < input.roots; r++) {
        let previous = commands.spawn({ [local]: 1, [world]: 0 });
        for (let d = 1; d < input.depth; d++) previous = commands.spawn({ [local]: 1, [world]: 0, [parent]: previous });
    }
});

const target = { type: "object", properties: { entity: Entity.schema } } as const;

/** Changes one row's own value. */
export const nudge = System.create({ name: "hierarchy/nudge", input: target, components: { write: [local] } }, (row, { input }) => {
    if (row.entity === input.entity) row[local] += 1;
});

/** Adds one leaf under a row. */
export const sprout = System.create({ name: "hierarchy/sprout", input: target }, ({ input, commands }) => {
    commands.spawn({ [local]: 1, [world]: 0, [parent]: input.entity });
});

/** The rows `turnover` spawns leaves under, set by the benchmark. */
export const under: Entity[] = [];
const leaves: Entity[] = [];

/** Despawns the leaves it spawned last time and spawns `count` new ones, one under each of `under`'s first rows; `tagged` puts them in an archetype of their own. */
export const turnover = System.create({
    name: "hierarchy/turnover",
    input: { type: "object", properties: { count: { type: "integer" }, tagged: { type: "boolean" } } },
}, ({ input, commands }) => {
    for (const entity of leaves.splice(0)) commands.despawn(entity);
    for (let i = 0; i < input.count; i++) {
        leaves.push(input.tagged
            ? commands.spawn({ [local]: 1, [world]: 0, [parent]: under[i], [leaf]: true })
            : commands.spawn({ [local]: 1, [world]: 0, [parent]: under[i] }));
    }
});

/** Moves a row, and the subtree under it, to another parent. */
export const reparent = System.create({
    name: "hierarchy/reparent",
    input: { type: "object", properties: { entity: Entity.schema, to: Entity.schema } },
}, ({ input, commands }) => {
    commands.add(input.entity, { [parent]: input.to });
});

export const offset = "hierarchy/offset";
export const placed = "hierarchy/placed";

declare module "@adobe/data-ecs" {
    export interface Components {
        [offset]: { type: number };
        [placed]: { type: number };
    }
}

Component.register(offset, { type: { type: "number", precision: 1 } });
Component.register(placed, { type: { type: "number", precision: 1 } });

/** `propagate` in 4-byte values, on the GPU. */
export const place = System.create({
    name: "hierarchy/place",
    kernel: "gpu",
    components: { read: [offset], write: [placed] },
    up: { through: parent, read: [placed] },
}, (row, { up }) => {
    row[placed] = (up === null ? 0 : up[placed]) + row[offset];
});

/** `forest` in 4-byte values. */
export const gpuForest = System.create({
    name: "hierarchy/gpuForest",
    input: { type: "object", properties: { roots: { type: "integer" }, depth: { type: "integer" } } },
}, ({ input, commands }) => {
    for (let r = 0; r < input.roots; r++) {
        let previous = commands.spawn({ [offset]: 1, [placed]: 0 });
        for (let d = 1; d < input.depth; d++) previous = commands.spawn({ [offset]: 1, [placed]: 0, [parent]: previous });
    }
});
