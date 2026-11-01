// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Index, System, World, workers, type Vec2, type Vec3 } from "@adobe/ecs";
import { it } from "vitest";
import { decode } from "../src/decode.js";
import { encode } from "../src/encode.js";
import { persist } from "../src/persist.js";
import { snapshot } from "../src/snapshot.js";
import { spawn } from "../src/spawn.js";

// Snapshot, encode, decode, spawn and merge of entities with a Vec3, a number, an owner reference and a struct holding
// an entity: through tables and spawnTables, and through rows and per-entity commands, as a program does without
// them; and a merge matching every entity by a unique index, into a world already holding them. Then one chunk of 100,
// told apart by a shared component, against the whole world and against one root's subtree: its snapshot by `where`,
// encoded, and spawned back. Each prints its median of a few runs; none asserts on time.

const position = Symbol();
const health = Symbol();
const parent = Symbol();
const link = Symbol();
const cell = Symbol();
const chunkOwner = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [cell]: { type: Vec2.I32; shared: true; [persist]: "perf/cell" };
        [chunkOwner]: { type: Entity; reference: "owner"; [persist]: "perf/chunkOwner" };
        [position]: { type: Vec3; [persist]: "perf/position" };
        [health]: { type: number; [persist]: "perf/health" };
        [parent]: { type: Entity; reference: "owner"; [persist]: "perf/parent" };
        [link]: { type: { readonly to: Entity; readonly weight: number }; [persist]: "perf/link" };
    }
}

/** Every entity's position is its own, so this index says which are the same in two worlds. */
const byPosition = Index.create({ key: [position], unique: true });

const size = { count: 0 };
/** A root and `count - 1` entities each owned by an earlier one, and each linked to another. */
const build = System.create(({ commands }) => {
    const made: Entity[] = [commands.spawn([position, health, link])({ [position]: [0, 0, 0], [health]: 1, [link]: { to: Entity.none, weight: 0 } })];
    for (let i = 1; i < size.count; i++) {
        made.push(commands.spawn([position, health, parent, link])({ [position]: [i, i, i], [health]: i, [parent]: made[i >> 1], [link]: { to: made[(i * 7) % i], weight: i } }));
    }
});

/** The row form of a snapshot: each entity's values, read row by row. */
type Rows = { entities: Entity[]; positions: Vec3[]; healths: number[]; parents: Entity[]; links: { readonly to: Entity; readonly weight: number }[] };
const rows: Rows = { entities: [], positions: [], healths: [], parents: [], links: [] };
const readRows = System.create({ readonly: true, components: { with: [position, health, link], optional: [parent] } }, row => {
    rows.entities.push(row.entity);
    rows.positions.push(row[position]);
    rows.healths.push(row[health]);
    rows.parents.push(row[parent] ?? Entity.none);
    rows.links.push(row[link]);
});
const given: { rows: Rows } = { rows };
/** Spawns each row, then sets its references once every entity is known, as commands must. */
const spawnRows = System.create(({ commands }) => {
    const { entities, positions, healths, parents, links } = given.rows;
    const spawned = new Map<Entity, Entity>();
    for (let i = 0; i < entities.length; i++) {
        spawned.set(entities[i], commands.spawn([position, health, link])({ [position]: positions[i], [health]: healths[i], [link]: { to: Entity.none, weight: links[i].weight } }));
    }
    for (let i = 0; i < entities.length; i++) {
        const entity = spawned.get(entities[i]) ?? Entity.none;
        const to = spawned.get(links[i].to) ?? Entity.none;
        if (parents[i] !== Entity.none) commands.add(entity, [parent, link], { [parent]: spawned.get(parents[i]) ?? Entity.none, [link]: { to, weight: links[i].weight } });
        else commands.add(entity, link, { to, weight: links[i].weight });
    }
});

const median = (times: readonly number[]): number => [...times].sort((a, b) => a - b)[times.length >> 1];
const timed = async (runs: number, before: () => Promise<void> | void, action: () => Promise<unknown> | unknown): Promise<number> => {
    const times: number[] = [];
    for (let run = 0; run < runs; run++) {
        await before();
        const start = performance.now();
        await action();
        times.push(performance.now() - start);
    }
    return median(times);
};

const results: string[] = [];

for (const count of [100_000, 1_000_000]) {
    it(`persists ${count} entities`, async () => {
        const runs = count > 100_000 ? 3 : 5;
        size.count = count;
        await using world = World.create({ [workers]: 0 });
        await world.run(build);
        const ms = (value: number): string => `${value.toFixed(1)} ms`;

        const rowSnapshot = await timed(runs, () => { rows.entities = []; rows.positions = []; rows.healths = []; rows.parents = []; rows.links = []; }, () => world.run(readRows));
        const rowJson = await timed(runs, () => {}, () => JSON.stringify(rows));
        const rowText = JSON.stringify(rows);
        const rowParse = await timed(runs, () => {}, () => JSON.parse(rowText));
        let into = World.create({ [workers]: 0 });
        const rowSpawn = await timed(runs, async () => { await into.dispose(); into = World.create({ [workers]: 0 }); given.rows = rows; }, () => into.run(spawnRows));

        let taken = await snapshot({ world });
        const tableSnapshot = await timed(runs, () => {}, async () => { taken = await snapshot({ world }); });
        if ("failure" in taken) throw new Error(taken.failure);
        const ready = taken;
        let bytes = encode(ready);
        const tableEncode = await timed(runs, () => {}, () => { bytes = encode(ready); });
        let decoded = decode(bytes);
        const tableDecode = await timed(runs, () => {}, () => { decoded = decode(bytes); });
        if ("failure" in decoded) throw new Error(decoded.failure);
        const loaded = decoded;
        const tableSpawn = await timed(runs, async () => { await into.dispose(); into = World.create({ [workers]: 0 }); }, () => spawn({ world: into, snapshot: loaded, entities: false }));
        const tableMerge = await timed(runs, async () => { await into.dispose(); into = World.create({ [workers]: 0 }); }, async () => { const copied = await snapshot({ world, resources: false }); if (copied.failure === undefined) await spawn({ world: into, snapshot: copied, entities: false }); });
        const tableMatch = await timed(runs, async () => {
            await into.dispose();
            into = World.create({ [workers]: 0 });
            await spawn({ world: into, snapshot: loaded, entities: false });
        }, () => spawn({ world: into, snapshot: loaded, entities: false, match: [byPosition] }));
        await into.dispose();

        results.push(
            `${count} entities, rows and commands: snapshot ${ms(rowSnapshot)}, JSON.stringify ${ms(rowJson)} (${(rowText.length / 1e6).toFixed(1)} MB), JSON.parse ${ms(rowParse)}, spawn ${ms(rowSpawn)}`,
            `${count} entities, tables: snapshot ${ms(tableSnapshot)}, encode ${ms(tableEncode)} (${(bytes.byteLength / 1e6).toFixed(1)} MB), decode ${ms(tableDecode)}, spawn ${ms(tableSpawn)}, merge ${ms(tableMerge)}, merge matching all ${ms(tableMatch)}`,
        );
        process.stdout.write(`${results.slice(-2).join("\n")}\n`);
    });
}

const chunks = 100;
/** `chunks` chunks of `size.count / chunks` entities each, a cell each, every entity of a chunk owned by its first. */
const buildChunks = System.create(({ commands }) => {
    const perChunk = size.count / chunks;
    for (let c = 0; c < chunks; c++) {
        const first = commands.spawn([cell, position, health], { [cell]: [c, 0] })({ [position]: [c, 0, 0], [health]: 0 });
        roots[c] = first;
        const owned = commands.spawn([cell, position, health, chunkOwner], { [cell]: [c, 0] });
        for (let k = 1; k < perChunk; k++) owned({ [position]: [c, k, 0], [health]: k, [chunkOwner]: first });
    }
});
const roots: Entity[] = [];
/** Despawns chunk `x`. */
const despawnChunk = System.create({ components: { with: [cell] } }, (row, { commands }, input: { readonly x: number }) => {
    if (row[cell][0] === input.x) commands.despawn(row.entity);
});

it(`persists one chunk of ${chunks} among 1000000 entities`, async () => {
    const runs = 5;
    size.count = 1_000_000;
    await using world = World.create({ [workers]: 0 });
    await world.run(buildChunks);
    const ms = (value: number): string => `${value.toFixed(2)} ms`;
    const x = 42;
    let one = await snapshot({ world, where: { [cell]: [x, 0] }, resources: false });
    const chunkSnapshot = await timed(runs, () => {}, async () => { one = await snapshot({ world, where: { [cell]: [x, 0] }, resources: false }); });
    if ("failure" in one && one.failure !== undefined) throw new Error(one.failure);
    const ready = one;
    let bytes = encode(ready);
    const chunkEncode = await timed(runs, () => {}, () => { bytes = encode(ready); });
    const fullSnapshot = await timed(3, () => {}, () => snapshot({ world, resources: false }));
    const rootSnapshot = await timed(3, () => {}, () => snapshot({ world, root: roots[x] ?? Entity.none }));
    const decoded = decode(bytes);
    if ("failure" in decoded) throw new Error(decoded.failure);
    const loaded = decoded;
    let into = World.create({ [workers]: 0 });
    const chunkSpawn = await timed(runs, async () => { await into.dispose(); into = World.create({ [workers]: 0 }); }, () => spawn({ world: into, snapshot: loaded, entities: false }));
    await into.dispose();
    // Back into the world it came from, once the chunk despawned.
    const chunkBack = await timed(runs, () => world.run(despawnChunk, { x }), async () => {
        const result = await spawn({ world, snapshot: loaded, entities: false });
        if (result.failure !== undefined) throw new Error(result.failure);
    });
    process.stdout.write(`chunk of ${size.count / chunks} among ${size.count}: snapshot by where ${ms(chunkSnapshot)}, encode ${ms(chunkEncode)} (${(bytes.byteLength / 1e6).toFixed(2)} MB), spawn into a new world ${ms(chunkSpawn)}, spawn back ${ms(chunkBack)}; whole world's snapshot ${ms(fullSnapshot)}, root's subtree ${ms(rootSnapshot)}\n`);
});
