// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World, workers, type Vec3 } from "@adobe/ecs";
import { it } from "vitest";
import { decode } from "../src/decode.js";
import { encode } from "../src/encode.js";
import { persist } from "../src/persist.js";
import { snapshot } from "../src/snapshot.js";
import { spawn } from "../src/spawn.js";

// Snapshot, encode, decode, spawn and merge of entities with a Vec3, a number, an owner reference and a struct holding
// an entity: through tables and spawnTables, and through rows and per-entity commands, as a program does without
// them. Each prints its median of a few runs; none asserts on time.

const position = Symbol();
const health = Symbol();
const parent = Symbol();
const link = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3; [persist]: "perf/position" };
        [health]: { type: number; [persist]: "perf/health" };
        [parent]: { type: Entity; reference: "owner"; [persist]: "perf/parent" };
        [link]: { type: { readonly to: Entity; readonly weight: number }; [persist]: "perf/link" };
    }
}

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
        await into.dispose();

        results.push(
            `${count} entities, rows and commands: snapshot ${ms(rowSnapshot)}, JSON.stringify ${ms(rowJson)} (${(rowText.length / 1e6).toFixed(1)} MB), JSON.parse ${ms(rowParse)}, spawn ${ms(rowSpawn)}`,
            `${count} entities, tables: snapshot ${ms(tableSnapshot)}, encode ${ms(tableEncode)} (${(bytes.byteLength / 1e6).toFixed(1)} MB), decode ${ms(tableDecode)}, spawn ${ms(tableSpawn)}, merge ${ms(tableMerge)}`,
        );
        process.stdout.write(`${results.slice(-2).join("\n")}\n`);
    });
}
