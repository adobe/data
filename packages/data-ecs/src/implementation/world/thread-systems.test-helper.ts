import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Observe } from "../../observe/index.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";

// Keys and systems both threads of the thread systems fixtures import: systems on thread "threadSystemsTest", which a
// joined thread fills, beside systems on the world's thread, and what each world holds after the same runs.

export const uid = Symbol("threadSystemsTest/uid");
export const position = Symbol("threadSystemsTest/position");
export const velocity = Symbol("threadSystemsTest/velocity");
export const flagged = Symbol("threadSystemsTest/flagged");
export const caption = Symbol("threadSystemsTest/caption");
export const note = Symbol("threadSystemsTest/note");
export const kept = Symbol("threadSystemsTest/kept");
export const total = Symbol("threadSystemsTest/total");
export const changes = Symbol("threadSystemsTest/changes");
export const paint = Symbol("threadSystemsTest/paint");
export const painted = Symbol("threadSystemsTest/painted");
export const enabled = Symbol("threadSystemsTest/enabled");
export const nextUid = Symbol("threadSystemsTest/nextUid");
declare module "@adobe/data-ecs" {
    export interface Threads {
        threadSystemsTest: true;
    }
    export interface Components {
        [uid]: { type: number };
        [position]: { type: readonly [number, number] };
        [velocity]: { type: number };
        [flagged]: { type: true };
        [caption]: { type: string | null; thread: "threadSystemsTest" };
        [note]: { type: Note | null; thread: "threadSystemsTest" };
        [kept]: { type: string };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [changes]: { type: number };
        [paint]: { type: string; thread: "threadSystemsTest" };
        [painted]: { type: number };
        [enabled]: { type: boolean };
        [nextUid]: { type: number };
    }
}
/** A value that isn't data, which only its thread holds. */
type Note = { readonly text: string; readonly read: () => string };
Component.register(uid, { type: { type: "integer" } });
Component.register(position, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(velocity, { type: { type: "number" } });
Component.register(flagged, { type: { const: true } });
Component.register(caption, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "none" }, thread: "threadSystemsTest" });
Component.register(note, { thread: "threadSystemsTest" });
/** An object of the world's thread. */
Component.register(kept, { type: { type: "string" } });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(changes, { type: { type: "integer", default: 0 } });
/** An object resource of the thread, which only systems there read and write. */
Resource.register(paint, { type: { type: "string", default: "plain" }, thread: "threadSystemsTest" });
Resource.register(painted, { type: { type: "integer", default: 0 } });
Resource.register(enabled, { type: { type: "boolean", default: true } });
Resource.register(nextUid, { type: { type: "integer", default: 1 } });

const makeNote = (text: string): Note => ({ text, read: () => text });

/** Spawns from the world's thread: structs and its own object, the thread's objects at their starts. */
export const seed = System.create({ name: "threadSystemsTest/seed", input: { type: "object", properties: { count: { type: "integer" } } }, resources: { write: [nextUid] } }, ({ input, resources, commands }) => {
    for (let k = 0; k < input.count; k++) {
        const id = resources[nextUid]++;
        commands.spawn([uid, position, velocity, caption, kept])({ [uid]: id, [position]: [id, -id], [velocity]: id % 3, [kept]: `k${id}` });
    }
});

/** On the world's thread: positions move by their velocity. */
export const move = System.create({ name: "threadSystemsTest/move", components: { read: [velocity], write: [position] } }, row => {
    const [x, y] = row[position];
    row[position] = [x + row[velocity], y - row[velocity]];
});

/** On the thread: captions written in place, from the structs it reads. */
export const describe = System.create({ name: "threadSystemsTest/describe", components: { read: [position, velocity], write: [caption] }, after: [move] }, row => {
    if (row[velocity] !== 0) row[caption] = `at ${row[position][0]}`;
});

/** On the thread: commands giving its objects values it stages, struct values and tags, and despawns. */
export const relabel = System.create({ name: "threadSystemsTest/relabel", components: { read: [uid, caption, position], has: [velocity] }, after: [describe] }, (row, { commands }) => {
    const id = row[uid];
    if (row[position][0] > 40) {
        commands.despawn(row.entity);
        return;
    }
    if (id % 4 === 1) commands.add(row.entity, note, makeNote(`${row[caption]}!`));
    if (id % 5 === 2) commands.add(row.entity, [flagged, caption], { [caption]: null });
    if (id % 7 === 3) commands.remove(row.entity, [velocity, note]);
    if (id % 6 === 0) commands.add(row.entity, velocity, 2);
});

/** On the thread, reading its object resource: spawns giving its objects values, with a struct resource's next uid. */
export const breed = System.create({ name: "threadSystemsTest/breed", resources: { read: [paint], write: [nextUid] }, after: [relabel] }, ({ resources, commands }) => {
    const id = resources[nextUid]++;
    commands.spawn([uid, position, velocity, caption, note])({ [uid]: id, [position]: [0, id], [velocity]: 1, [caption]: `${resources[paint]} ${id}`, [note]: makeNote(`bred ${id}`) });
});

/** On the thread: a reduction over its objects and structs. */
export const tally = System.create({ name: "threadSystemsTest/tally", components: { read: [caption, position] }, reduce: { [total]: "+" }, after: [breed] }, (row, { reduce }) => {
    reduce[total]((row[caption]?.length ?? 0) + row[position][1]);
});

/** On the thread: a change filter on its own objects, writing a struct resource. */
export const watchCaptions = System.create({ name: "threadSystemsTest/watchCaptions", components: { changed: [caption] }, resources: { write: [changes] }, after: [tally] }, (_row, { resources }) => {
    resources[changes] += 1;
});

/** On the thread, while `enabled` holds: writes its object resource, and a struct resource from it. */
export const repaint = System.create({ name: "threadSystemsTest/repaint", resources: { write: [paint, painted], is: [enabled] }, after: [watchCaptions] }, ({ resources }) => {
    resources[paint] = `${resources[paint]}+`;
    resources[painted] = resources[paint].length;
});

/** On the thread: a lookup reading an entity's structs and this thread's objects. */
export const peek = System.create({ name: "threadSystemsTest/peek", components: { has: [uid, note] }, lookup: { self: { read: [position, caption] } }, after: [repaint] }, (row, { lookup, commands }) => {
    const self = lookup.self(row.entity);
    if (self !== null && ((self[caption]?.length ?? 0) + self[position][1]) % 2 === 1) commands.add(row.entity, flagged);
});

/** On the world's thread, beside `tally`: a world object from the structs. */
export const keep = System.create({ name: "threadSystemsTest/keep", components: { read: [uid], write: [kept], added: [kept] }, after: [breed], before: [watchCaptions] }, row => {
    row[kept] = `${row[kept]}.${row[uid] % 10}`;
});

/** On the thread, failing after its commands: later tiers are skipped, and its commands still apply. */
export const fail = System.create({ name: "threadSystemsTest/fail", components: { read: [uid, caption] } }, (row, { commands }) => {
    commands.add(row.entity, flagged);
    if (row[uid] === 3 && row[caption] !== undefined) throw new Error("threadSystemsTest failure");
});
export const afterFail = System.create({ name: "threadSystemsTest/afterFail", components: { read: [caption] }, after: [fail] }, (row, { commands }) => {
    if (row[caption] !== undefined) commands.despawn(row.entity);
});
export const failing = System.create({ name: "threadSystemsTest/failing", systems: [fail, afterFail] });

/** A tick's systems, on both threads, in tiers some of which run on the joined thread alone, one after another. */
export const tick = System.create({ name: "threadSystemsTest/tick", systems: [move, describe, relabel, breed, tally, keep, watchCaptions, repaint, peek] });

/** On the thread, with input, which comes to it by message. */
export const stamp = System.create({ name: "threadSystemsTest/stamp", input: { type: "object", properties: { text: { type: "string" } } }, components: { read: [uid], write: [caption] } }, (row, { input }) => {
    if (row[uid] === 1) row[caption] = input.text;
});

/** Disables `repaint`, from the world's thread. */
export const disable = System.create({ name: "threadSystemsTest/disable", resources: { write: [enabled] } }, ({ resources }) => {
    resources[enabled] = false;
});

/** What a world holds, by uid, with its resources: what both worlds compare. */
export type Snapshot = {
    readonly entities: readonly (readonly [number, { readonly [name: string]: unknown }])[];
    readonly total: number;
    readonly changes: number;
    readonly painted: number;
};

const names: readonly (readonly [symbol, string])[] = [
    [uid, "uid"], [position, "position"], [velocity, "velocity"], [flagged, "flagged"], [caption, "caption"], [note, "note"], [kept, "kept"],
];

/** An entity's value as data, by key names, a note by its text. */
const plain = (value: { readonly [key: symbol]: unknown } | null): { readonly [name: string]: unknown } => {
    const result: { [name: string]: unknown } = {};
    if (value === null) return result;
    for (const [key, name] of names) {
        if (!Object.hasOwn(value, key)) continue;
        const held = value[key];
        result[name] = key === note && typeof held === "object" && held !== null ? Reflect.get(held, "text") : held;
    }
    return result;
};

/** The thread's objects of `entities`, as data, read where they live: the world itself inline, or the thread that fills them. */
export type Objects = (entities: readonly Entity[]) => Promise<readonly { readonly [name: string]: unknown }[]>;

/** The entities `readObjects` reads, and what it read of each. */
const reading: { entities: readonly Entity[]; objects: readonly { readonly [name: string]: unknown }[] } = { entities: [], objects: [] };

/** Each entity's objects of the thread, as data, a note by its text: none for an entity that's dead or has no uid. */
const readObjects = System.create({
    name: "threadSystemsTest/readObjects",
    synced: true,
    lookup: { ids: { has: [uid] }, captions: { read: [caption] }, notes: { read: [note] } },
}, ({ lookup }) => {
    reading.objects = reading.entities.map(entity => {
        const objects: { [name: string]: unknown } = {};
        if (lookup.ids(entity) === null) return objects;
        const captioned = lookup.captions(entity);
        if (captioned !== null) objects.caption = captioned[caption];
        const noted = lookup.notes(entity);
        if (noted !== null) objects.note = noted[note]?.text ?? null;
        return objects;
    });
});

/** Objects read where they live by a synced run on `threads`, as of the world's last sync point: a joined thread's, or an inline world's own. */
export const objectsThere = (threads: World): Objects => async entities => {
    reading.entities = entities;
    await threads.run(readObjects);
    return reading.objects;
};

/** What a world holds after its runs: each entity by uid, its structs and the world's objects, and the thread's objects. */
export const snapshot = async (world: World, objects: Objects): Promise<Snapshot> => {
    const entities = await Observe.toPromise(Observe.select(world, { required: [uid] }));
    const here = await Promise.all(entities.map(async entity => plain(await Observe.toPromise(Observe.entity(world, entity, { optional: [uid, position, velocity, flagged, kept] })))));
    const there = await objects(entities);
    const listed = here.map((value, k) => [Number(value.uid), { ...value, ...there[k] }] as const);
    return {
        entities: listed.sort((a, b) => a[0] - b[0]),
        total: await Observe.toPromise(Observe.resource(world, total)),
        changes: await Observe.toPromise(Observe.resource(world, changes)),
        painted: await Observe.toPromise(Observe.resource(world, painted)),
    };
};

/** A report as data both worlds compare: its warnings apart, which only a world with a joined thread has. */
const comparable = ({ failures, skipped, dropped, warnings }: World.Report) => ({
    report: { failures: failures.map(failure => [failure.kind, failure.name, failure.message]), skipped, dropped },
    warnings: warnings.map(warning => warning.name),
});

/**
 * The runs both worlds take: seeds, ticks, a run with input, a failing run, and ticks with `repaint` disabled. Without
 * `objects`, the world is inline.
 */
export const scenario = async (world: World, objects: Objects = objectsThere(world)) => {
    const snapshots: Snapshot[] = [];
    const reports: unknown[] = [];
    const warnings: (readonly string[])[] = [];
    const ran = (report: World.Report): void => {
        const { report: data, warnings: names } = comparable(report);
        reports.push(data);
        warnings.push(names);
    };
    ran(await world.run(seed, { count: 12 }));
    for (let k = 0; k < 6; k++) {
        ran(await world.run(tick));
        snapshots.push(await snapshot(world, objects));
    }
    ran(await world.run(stamp, { text: "stamped" }));
    ran(await world.run(failing));
    snapshots.push(await snapshot(world, objects));
    ran(await world.run(disable));
    for (let k = 0; k < 2; k++) ran(await world.run(tick));
    snapshots.push(await snapshot(world, objects));
    return { snapshots, reports, warnings };
};

/** Spawns entities with captions, from the world's thread. */
export const crowd = System.create({ name: "threadSystemsTest/crowd", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([uid, caption])({ [uid]: 1000 + k });
});
/** On the world's thread: every crowd entity but uid 1000 moves archetype, flagged on one run and not on the next. */
export const flagCrowd = System.create({ name: "threadSystemsTest/flagCrowd", components: { read: [uid], has: [caption], not: [flagged] } }, (row, { commands }) => {
    if (row[uid] !== 1000) commands.add(row.entity, flagged);
});
export const unflagCrowd = System.create({ name: "threadSystemsTest/unflagCrowd", components: { has: [caption, flagged] } }, (row, { commands }) => {
    commands.remove(row.entity, flagged);
});
/** On the thread: writes uid 1000's caption in place. */
export const write = System.create({ name: "threadSystemsTest/write", components: { read: [uid], write: [caption] } }, row => {
    if (row[uid] === 1000) row[caption] = "written";
});
/** On the thread: counts captions it holds that the thread wrote, into a struct resource. */
export const countWritten = System.create({ name: "threadSystemsTest/countWritten", components: { read: [caption] }, resources: { write: [changes] } }, (row, { resources }) => {
    if (row[caption] === "written") resources[changes] += 1;
});

/** On the thread: gives an object of the world's thread a value, which can't cross, so its command drops and it fails. */
export const giveKept = System.create({ name: "threadSystemsTest/giveKept", components: { read: [caption] } }, (row, { commands }) => {
    if (row[caption] !== undefined) commands.add(row.entity, kept, "given there");
});
/** On the thread: spawns giving an object of the world's thread a value, which throws when it's issued. */
export const spawnKept = System.create({ name: "threadSystemsTest/spawnKept", resources: { read: [paint] } }, ({ resources, commands }) => {
    commands.spawn([uid, kept])({ [uid]: resources[paint].length, [kept]: "spawned there" });
});

/** On the thread: runs until its thread ends, so its task never completes. */
export const stall = System.create({ name: "threadSystemsTest/stall", resources: { read: [paint] } }, ({ resources }) => {
    while (resources[paint] !== "never") { /* until the thread ends */ }
});
/** On the world's thread: counts its runs, ticking with nothing on the thread. */
export const count = System.create({ name: "threadSystemsTest/count", resources: { write: [changes] } }, ({ resources }) => {
    resources[changes] += 1;
});
/**
 * Runs of `counted` on this thread, and how many had run once `due`, a time in `performance.now()`, passed; and a
 * timer's callback for its next run to set, while it runs a task, as a thread's systems do.
 */
export const ranHere: { runs: number; due: number; atDue: number; queued: (() => void) | null } = { runs: 0, due: Infinity, atDue: -1, queued: null };

/**
 * Sets the queued timer, which runs only once this thread returns to its event loop, and when it's due: in node 2 ms
 * after a timer of 1 ms, as the loop's clock steps in milliseconds; in a browser at once, for a timer of 0 ms.
 */
const setQueued = (task: () => void): void => {
    const node = globalThis.process?.versions?.node !== undefined;
    setTimeout(task, node ? 1 : 0);
    ranHere.due = performance.now() + (node ? 2 : 0);
    ranHere.atDue = -1;
};
/** On the thread: counts its runs, so the world's ticks post it a task each. */
export const countThere = System.create({ name: "threadSystemsTest/countThere", resources: { read: [paint], write: [changes] } }, ({ resources }) => {
    if (resources[paint] !== "never") resources[changes] += 1;
});

/** On the thread: counts its runs there in `ranHere`; it reaches its commands, so it blocks its tier, a task a tick. */
export const counted = System.create({ name: "threadSystemsTest/counted", resources: { read: [paint] } }, ({ resources, commands }) => {
    void resources[paint];
    void commands;
    ranHere.runs++;
    if (ranHere.queued !== null) {
        setQueued(ranHere.queued);
        ranHere.queued = null;
    }
    if (ranHere.atDue < 0 && performance.now() >= ranHere.due) ranHere.atDue = ranHere.runs;
});
