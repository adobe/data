import { Component } from "../component/component.js";
import { Entity } from "../entity/entity.js";
import { System } from "../system/system.js";

export const local = "hierarchy/local";
export const world = "hierarchy/world";
export const parent = "hierarchy/parent";

declare module "@adobe/data-ecs" {
    export interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(world, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });

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
