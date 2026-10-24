// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "../../interface/entity/entity.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld, join } from "./create.js";
import { readEach, readResource, select } from "./reads.test-helper.js";
import { fillReports } from "./reports.test-helper.js";

const label = Symbol("stringsTest/label");
const order = Symbol("stringsTest/order");
const tagged = Symbol("stringsTest/tagged");
const mode = Symbol("stringsTest/mode");
const title = Symbol("stringsTest/title");
const note = Symbol("stringsTest/note");

declare module "@adobe/ecs" {
    export interface Components {
        [label]: { type: string };
        [order]: { type: number };
        [tagged]: { type: true };
        [note]: { type: string | null };
    }
    export interface Resources {
        [mode]: { type: "edit" | "view"; default: "view" };
        [title]: { type: string };
    }
}


/** Text of every kind a string holds: none, letters, astral characters as surrogate pairs, and a long run. */
const textOf = (n: number): string => n % 4 === 0 ? "" : n % 4 === 1 ? `item ${n}` : n % 4 === 2 ? `✓ ${n} 😀 naïve` : `${"long ".repeat(40)}${n}`;

const spawn = System.create({}, ({ commands }, input: { readonly count: number; readonly from: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([label, order])({ [label]: textOf(input.from + i), [order]: input.from + i });
});

/** `count` rows with labels of 400 code units, whose records are 1024-byte blocks of the arena. */
const spawnLong = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([label, order])({ [label]: `${i}`.padStart(400, "·"), [order]: i });
});

/** A run over every row that changes nothing, for its sync point. */
const pass = System.create({ components: { read: [order] } }, row => { void row[order]; });

const rename = System.create({ components: { read: [order], write: [label] } }, (row, _context, input: { readonly suffix: string }) => {
    row[label] = `${textOf(row[order])}${input.suffix}`;
});

const relabel = System.create({ components: { read: [order], has: [label] } }, (row, { commands }, input: { readonly suffix: string }) => {
    commands.add(row.entity, label, `${textOf(row[order])}${input.suffix}`);
});

const tag = System.create({ components: { has: [label] } }, (row, { commands }) => commands.add(row.entity, tagged));
const untag = System.create({ components: { has: [tagged] } }, (row, { commands }) => commands.remove(row.entity, tagged));
const unlabel = System.create({ components: { has: [label] } }, (row, { commands }) => commands.remove(row.entity, label));
const despawn = System.create({ components: { has: [order] } }, (row, { commands }) => commands.despawn(row.entity));
const annotate = System.create({ components: { read: [order], write: [note] } }, row => {
    row[note] = row[order] % 3 === 0 ? null : `note ${row[order]}`;
});
const unannotate = System.create({ components: { write: [note] } }, row => {
    row[note] = null;
});
const noted = System.create({ components: { has: [order], not: [note] } }, (row, { commands }) => commands.add(row.entity, note, null));
const despawnEven = System.create({ components: { read: [order] } }, (row, { commands }) => {
    if (row[order] % 2 === 0) commands.despawn(row.entity);
});
const labelAgain = System.create({ components: { read: [order], not: [label] } }, (row, { commands }, input: { readonly suffix: string }) => {
    commands.add(row.entity, label, `${textOf(row[order])}${input.suffix}`);
});

const edit = System.create({ resources: { write: [mode, title] } }, ({ resources }, input: { readonly title: string }) => {
    resources[mode] = "edit";
    resources[title] = input.title;
});

/** Each entity's label, in order. */
const labels = async (world: ReturnType<typeof createWorld>): Promise<(string | null)[]> => {
    const entities: readonly Entity[] = await select(world, { required: [order], order: { [order]: true } });
    return readEach(world, entities, label);
};

const arena = async (world: ReturnType<typeof createWorld>): Promise<number> => (await world.tables()).arena;

/** Once the world's joined threads are as `accept` takes them. */
const until = (world: ReturnType<typeof createWorld>, accept: (threads: readonly { readonly status: string }[]) => boolean): Promise<void> => new Promise(resolve => {
    let done = false;
    const stop = world.threads(threads => {
        if (done || !accept(threads)) return;
        done = true;
        queueMicrotask(() => stop());
        resolve();
    });
});

describe("strings", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it("are written and read back as they were given", async () => {
        const world = createWorld({ [workers]: 0, [title]: "Hello 👋" });
        await world.run(spawn, { count: 1000, from: 0 });
        expect(await labels(world)).toEqual(Array.from({ length: 1000 }, (_, i) => textOf(i)));
        await world.run(rename, { suffix: "!" });
        expect(await labels(world)).toEqual(Array.from({ length: 1000 }, (_, i) => `${textOf(i)}!`));
        await world.run(relabel, { suffix: "?" });
        expect(await labels(world)).toEqual(Array.from({ length: 1000 }, (_, i) => `${textOf(i)}?`));
        await world.run(noted);
        const entities: readonly Entity[] = await select(world, { required: [order], order: { [order]: true } });
        expect(await readEach(world, entities, note)).toEqual(entities.map(() => null));
        await world.run(annotate);
        expect(await readEach(world, entities, note)).toEqual(entities.map((_, i) => i % 3 === 0 ? null : `note ${i}`));
        await world.run(unannotate);
        expect(await readEach(world, entities, note)).toEqual(entities.map(() => null));
        expect([await readResource(world, mode), await readResource(world, title)]).toEqual(["view", "Hello 👋"]);
        await world.run(edit, { title: "Bye" });
        expect([await readResource(world, mode), await readResource(world, title)]).toEqual(["edit", "Bye"]);
        await world.dispose();
    });
    it("are kept in shared memory while a joined thread may read them, from its share until it's gone", async () => {
        const world = createWorld({ [workers]: 0 });
        // Every run's report is an entity, up to the reports retained, which this holds no more past.
        await fillReports(world);
        // Records of more than 512 bytes are the arena's own blocks, so the arena shows them freed.
        await world.run(spawnLong, { count: 1000 });
        const alone = await arena(world);
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: [] });
        await until(world, threads => threads.at(-1)?.status === "joined");
        const shared = await arena(world);
        expect(shared - alone).toBeGreaterThan(1000 * 1024);
        await remote.dispose();
        await until(world, threads => threads.at(-1)?.status === "gone");
        // Let go between runs, then freed once two sync points have passed.
        for (let k = 0; k < 3; k++) await world.run(pass);
        expect(await arena(world)).toBeLessThan(alone + 64 * 1024);
        expect((await labels(world)).every(text => text?.length === 400)).toBe(true);
        await world.dispose();
    });
    it("keep their values as their entities move between archetypes and others leave", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn, { count: 50, from: 0 });
        await world.run(tag);
        await world.run(despawnEven);
        await world.run(untag);
        expect(await labels(world)).toEqual(Array.from({ length: 25 }, (_, i) => textOf(2 * i + 1)));
        await world.dispose();
    });
    it("free a replaced, removed or despawned string's record, so rewriting, removing and spawning again holds no more", async () => {
        const world = createWorld({ [workers]: 0 });
        // Records are kept while a joined thread may read them.
        const channel = new MessageChannel();
        world.share(channel.port1);
        const remote = join(channel.port2, { threads: [] });
        // Every run's report is an entity, up to the reports retained, which this holds no more past.
        await fillReports(world);
        await world.run(spawn, { count: 200, from: 0 });
        /** What the world holds after `rounds` more, once a first round reached its steady state. */
        const heldAfter = async (rounds: number, round: (n: number) => Promise<unknown>): Promise<readonly [number, number]> => {
            // Replaced records are reused once a sync point has passed since, and the tables grow once.
            for (let n = 0; n < 4; n++) await round(n);
            const steady = await arena(world);
            for (let n = 0; n < rounds; n++) await round(n);
            return [await arena(world), steady];
        };
        const [rewritten, rewriting] = await heldAfter(20, n => world.run(n % 2 === 0 ? rename : relabel, { suffix: ` ${n % 2}` }));
        expect(rewritten).toBeLessThanOrEqual(rewriting);
        const [readded, readding] = await heldAfter(6, async n => {
            await world.run(unlabel);
            await world.run(labelAgain, { suffix: ` ${n % 2}` });
        });
        expect(readded).toBeLessThanOrEqual(readding);
        const [respawned, respawning] = await heldAfter(6, async n => {
            await world.run(despawn);
            await world.run(spawn, { count: 200, from: 0 });
            await world.run(rename, { suffix: ` ${n % 2}` });
        });
        expect(respawned).toBeLessThanOrEqual(respawning);
        await remote.dispose();
        await world.dispose();
    });
    it("are held as they are where there's no shared memory", async () => {
        vi.stubGlobal("crossOriginIsolated", false);
        const world = createWorld({ [workers]: 0, [title]: "Hello" });
        await world.run(spawn, { count: 100, from: 0 });
        await world.run(rename, { suffix: "!" });
        expect(await labels(world)).toEqual(Array.from({ length: 100 }, (_, i) => `${textOf(i)}!`));
        await world.run(edit, { title: "Bye" });
        expect(await readResource(world, title)).toBe("Bye");
        await world.dispose();
    });
});
