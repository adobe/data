// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Index, System, World, workers, type Vec2 } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { decode } from "../decode.js";
import { encode } from "../encode.js";
import { snapshot, type Snapshot } from "../snapshot.js";
import { spawn } from "../spawn.js";

const cell = Symbol();
const spot = Symbol();
const owner = Symbol();
const plain = Symbol();
/** The trait these entities are saved by, its value each key's name. */
const saved = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [saved]: string;
    }
    interface Components {
        [cell]: { type: Vec2.I32; shared: true; [saved]: "cell" };
        [spot]: { type: number; [saved]: "spot" };
        [owner]: { type: Entity; reference: "owner"; [saved]: "owner" };
        [plain]: { type: number; [saved]: "plain" };
    }
}

const bySpot = Index.create({ key: [spot], unique: true });

const inline = () => World.create({ [workers]: 0 });

/** Four chunks, `x` 0 to 3, of `perChunk` entities each, every one's spot `100 * x + k`; the second of each owned by the first. */
const fill = System.create({}, ({ commands }, input: { readonly perChunk: number }) => {
    for (let x = 0; x < 4; x++) {
        const chunk = commands.spawn([cell, spot], { [cell]: [x, 0] });
        const first = chunk({ [spot]: 100 * x });
        commands.spawn([cell, spot, owner], { [cell]: [x, 0] })({ [spot]: 100 * x + 1, [owner]: first });
        for (let k = 2; k < input.perChunk; k++) chunk({ [spot]: 100 * x + k });
    }
});

/** Despawns the entities of chunk `x` from its `from`th spot on. */
const clear = System.create({ components: { with: [cell, spot] } }, (row, { commands }, input: { readonly x: number; readonly from: number }) => {
    if (row[cell][0] === input.x && row[spot] % 100 >= input.from) commands.despawn(row.entity);
});

type Placed = { readonly entity: Entity; readonly x: number; readonly spot: number; readonly owner: Entity | undefined };
const placed: Placed[] = [];
const look = System.create({ readonly: true, components: { with: [cell, spot], optional: [owner] } }, row => {
    placed.push({ entity: row.entity, x: row[cell][0], spot: row[spot], owner: row[owner] });
});
const placedIn = async (world: World): Promise<readonly Placed[]> => {
    placed.length = 0;
    await world.run(look);
    return [...placed].sort((a, b) => a.spot - b.spot);
};

/** The counts of the archetypes holding chunk 1, most first. */
const chunkTables = System.create({ readonly: true, tables: { components: [spot], where: { [cell]: [1, 0] } } }, ({ tables }) => tables.archetypes.map(table => table.count).sort((a, b) => b - a));

const taken = async (world: World, x: number): Promise<Snapshot> => {
    const result = await snapshot({ world, by: saved, where: { [cell]: [x, 0] } });
    if (result.failure !== undefined) throw new Error(result.failure);
    return result;
};

describe("snapshots by shared values", () => {
    it("take the entities of the archetypes holding where's values, and nothing else", async () => {
        await using world = inline();
        await world.run(fill, { perChunk: 5 });
        const chunk = decode(encode(await taken(world, 2)), { by: saved });
        if (chunk.failure !== undefined) throw new Error(chunk.failure);
        await using into = inline();
        await spawn({ world: into, snapshot: chunk });
        expect((await placedIn(into)).map(item => [item.x, item.spot])).toEqual([[2, 200], [2, 201], [2, 202], [2, 203], [2, 204]]);
        const none = await snapshot({ world, by: saved, where: { [cell]: [9, 9] } });
        if (none.failure !== undefined) throw new Error(none.failure);
        await using empty = inline();
        await spawn({ world: empty, snapshot: none });
        expect(await placedIn(empty)).toEqual([]);
    });

    it("load a chunk back into the archetype of its shared value, its owner references rewritten", async () => {
        await using world = inline();
        await world.run(fill, { perChunk: 5 });
        const before = await placedIn(world);
        const chunk = await taken(world, 1);
        await world.run(clear, { x: 1, from: 0 });
        expect((await placedIn(world)).filter(item => item.x === 1)).toEqual([]);
        const spawned = await spawn({ world, snapshot: chunk });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        const after = await placedIn(world);
        expect(after.map(item => [item.x, item.spot])).toEqual(before.map(item => [item.x, item.spot]));
        // Back in the chunk's archetypes, those its first spawn made, and no others.
        expect(await world.run(chunkTables)).toEqual([4, 1]);
        const first = after.find(item => item.spot === 100)?.entity;
        expect(after.find(item => item.spot === 101)?.owner).toBe(first);
    });

    it("merge a chunk back with match, keeping the entities still there and spawning those that aren't", async () => {
        await using world = inline();
        await world.run(fill, { perChunk: 5 });
        const chunk = await taken(world, 1);
        await world.run(clear, { x: 1, from: 3 });
        const kept = (await placedIn(world)).filter(item => item.x === 1);
        expect(kept.map(item => item.spot)).toEqual([100, 101, 102]);
        const spawned = await spawn({ world, snapshot: chunk, match: [bySpot] });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        const after = (await placedIn(world)).filter(item => item.x === 1);
        expect(after.map(item => item.spot)).toEqual([100, 101, 102, 103, 104]);
        for (const item of kept) expect(after.find(other => other.spot === item.spot)?.entity).toBe(item.entity);
        expect(await world.run(chunkTables)).toEqual([4, 1]);
        expect((await placedIn(world)).length).toBe(20);
    });

    it("fail, as data, for a where naming what isn't a shared component or giving one a value not of its type", async () => {
        await using world = inline();
        // @ts-expect-error: where names only shared components.
        const unshared = await snapshot({ world, by: saved, where: { [plain]: 1 } });
        expect(unshared.failure).toMatch(/isn't a shared component/);
        // @ts-expect-error: a value of the component's type.
        const mistyped = await snapshot({ world, by: saved, where: { [cell]: "far" } });
        expect(mistyped.failure).toMatch(/isn't one of its type's values/);
    });
});
