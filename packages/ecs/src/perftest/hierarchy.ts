// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import { Entity } from "../interface/entity/entity.js";
import { System } from "../interface/system/system.js";
import type { F32 } from "../interface/math/index.js";

export const local = Symbol("hierarchy/local");
export const world = Symbol("hierarchy/world");
export const parent = Symbol("hierarchy/parent");
export const leaf = Symbol("hierarchy/leaf");

declare module "@adobe/ecs" {
    export interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [leaf]: { type: true };
    }
}


const root = Archetype.create([local, world]);
const child = Archetype.create([local, world, parent]);
const taggedChild = Archetype.create([local, world, parent, leaf]);

/** Each row's world value is its parent's plus its own. */
export const propagate = System.create({
    kernel: true,
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** The same, only for rows whose own or parent's values changed since it last ran. */
export const propagateChanged = System.create({
    kernel: true,
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** `roots` chains of `depth` rows each. */
export const forest = System.create({
}, ({ commands }, input: { readonly roots: number; readonly depth: number }) => {
    for (let r = 0; r < input.roots; r++) {
        let previous = commands.spawn(root)({ [local]: 1, [world]: 0 });
        for (let d = 1; d < input.depth; d++) previous = commands.spawn(child)({ [local]: 1, [world]: 0, [parent]: previous });
    }
});

const target = { type: "object", properties: { entity: Entity.schema } } as const;

/** Changes one row's own value. */
export const nudge = System.create({ components: { write: [local] } }, (row, _context, input: { readonly entity: Entity }) => {
    if (row.entity === input.entity) row[local] += 1;
});

/** Adds one leaf under a row. */
export const sprout = System.create({}, ({ commands }, input: { readonly entity: Entity }) => {
    commands.spawn(child)({ [local]: 1, [world]: 0, [parent]: input.entity });
});

/** The rows `turnover` spawns leaves under, set by the benchmark. */
export const under: Entity[] = [];
const leaves: Entity[] = [];

/** Despawns the leaves it spawned last time and spawns `count` new ones, one under each of `under`'s first rows; `tagged` puts them in an archetype of their own. */
export const turnover = System.create({
}, ({ commands }, input: { readonly count: number; readonly tagged: boolean }) => {
    for (const entity of leaves.splice(0)) commands.despawn(entity);
    for (let i = 0; i < input.count; i++) {
        leaves.push(input.tagged
            ? commands.spawn(taggedChild)({ [local]: 1, [world]: 0, [parent]: under[i] })
            : commands.spawn(child)({ [local]: 1, [world]: 0, [parent]: under[i] }));
    }
});

/** Moves a row, and the subtree under it, to another parent. */
export const reparent = System.create({
}, ({ commands }, input: { readonly entity: Entity; readonly to: Entity }) => {
    commands.add(input.entity, parent, input.to);
});

export const offset = Symbol("hierarchy/offset");
export const placed = Symbol("hierarchy/placed");

declare module "@adobe/ecs" {
    export interface Components {
        [offset]: { type: F32 };
        [placed]: { type: F32 };
    }
}


const gpuRoot = Archetype.create([offset, placed]);
const gpuChild = Archetype.create([offset, placed, parent]);

/** `propagate` in 4-byte values, on the GPU. */
export const place = System.create({
    kernel: "gpu",
    components: { read: [offset], write: [placed] },
    up: { through: parent, read: [placed] },
}, (row, { up }) => {
    row[placed] = (up === null ? 0 : up[placed]) + row[offset];
});

/** `forest` in 4-byte values. */
export const gpuForest = System.create({
}, ({ commands }, input: { readonly roots: number; readonly depth: number }) => {
    for (let r = 0; r < input.roots; r++) {
        let previous = commands.spawn(gpuRoot)({ [offset]: 1, [placed]: 0 });
        for (let d = 1; d < input.depth; d++) previous = commands.spawn(gpuChild)({ [offset]: 1, [placed]: 0, [parent]: previous });
    }
});
