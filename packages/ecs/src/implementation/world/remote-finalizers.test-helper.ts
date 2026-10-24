// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import type { Schema } from "../../interface/schema/schema.js";
import type { Vec3 } from "../../interface/math/index.js";

// Keys, systems and a finalizer both threads of the remote finalizers tests import: a finalizer on thread
// "remoteFinalizersTest", which a joined thread fills, reading structs, a constant, that thread's objects and its
// object resource, and what it saw, on the thread it ran on.

export const serial = Symbol("remoteFinalizersTest/serial");
export const place = Symbol("remoteFinalizersTest/place");
export const marked = Symbol("remoteFinalizersTest/marked");
export const flagged = Symbol("remoteFinalizersTest/flagged");
export const widget = Symbol("remoteFinalizersTest/widget");
export const label = Symbol("remoteFinalizersTest/label");
export const tone = Symbol("remoteFinalizersTest/tone");
export const title = Symbol("remoteFinalizersTest/title");
export const headed = Symbol("remoteFinalizersTest/headed");
export const heading = Symbol("remoteFinalizersTest/heading");
export const subheading = Symbol("remoteFinalizersTest/subheading");
export const level = Symbol("remoteFinalizersTest/level");
export const origin = Symbol("remoteFinalizersTest/origin");
export const caption = Symbol("remoteFinalizersTest/caption");
export const lit = Symbol("remoteFinalizersTest/lit");
export const tint = Symbol("remoteFinalizersTest/tint");
export const sample = Symbol("remoteFinalizersTest/sample");
export const material = Symbol("remoteFinalizersTest/material");
declare module "@adobe/ecs" {
    export interface Threads {
        remoteFinalizersTest: true;
    }
    export interface Components {
        [serial]: { type: Schema.Type<{ type: "integer" }> };
        [place]: { type: readonly [number, number] };
        [marked]: { type: true };
        [flagged]: { type: true };
        [widget]: { type: Widget | null; thread: "remoteFinalizersTest" };
        [label]: { type: { readonly text: string } | null; thread: "remoteFinalizersTest"; default: { text: "none" } };
        [title]: { type: string };
        [headed]: { type: true };
    }
    export interface Resources {
        [tone]: { type: { readonly text: string }; thread: "remoteFinalizersTest"; default: { text: "quiet" } };
        [heading]: { type: string; default: "h" };
        [subheading]: { type: string; default: "s" };
        [level]: { type: number; default: -1 };
        [origin]: { type: readonly [number, number]; default: [-1, -1] };
        [caption]: { type: string; default: "c" };
        [lit]: { type: boolean };
        [tint]: { type: Vec3; default: [-1, -1, -1] };
        [sample]: { type: Schema.Type<{ type: "object"; properties: { on: { type: "boolean" }; count: { type: "integer"; minimum: 0; maximum: 4294967295 }; weight: { type: "number" }; ratio: { type: "number"; precision: 1 } } }>; default: { on: false; count: 0; weight: -1; ratio: -1 } };
        [material]: { type: Schema.Type<{ type: "object"; properties: { alpha: { type: "number"; precision: 1 }; color: { type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }; glossy: { type: "boolean" } }; layout: "storage" }>; default: { alpha: -1; color: [-1, -1, -1]; glossy: false } };
    }
}
/** A value that isn't data, which only its thread holds. */
type Widget = { readonly tag: string; readonly draw: () => string };
const text = { type: "object", properties: { text: { type: "string" } } } as const;
/** A string, in shared memory, which the world's thread writes and the finalizer on the thread reads. */
/** A string resource, which the world's thread writes and the finalizer on the thread reads. */
/** Linear resources, a number and a struct, which the world's thread writes and the finalizer on the thread reads. */
/** Resources of mixed widths: a string, a boolean (1 byte), an f32 vec3 (12), a padded CPU struct (24) and a storage struct (32). */
type Sample = { readonly on: boolean; readonly count: number; readonly weight: number; readonly ratio: number };
type Material = { readonly alpha: number; readonly color: readonly [number, number, number]; readonly glossy: boolean };
const f32 = { type: "number", precision: 1 } as const;
const vec3 = { type: "array", items: f32, minItems: 3, maxItems: 3 } as const;

/** A stop as the finalizer saw it, on the thread it ran on. */
export type Released = { readonly serial: number; readonly place: readonly number[]; readonly marked: boolean; readonly widget: string | null; readonly label: string | null; readonly tone: string };

/** Every stop finalized on this thread, in order, with the entity each was. */
export const released: Released[] = [];
export const finalized: Entity[] = [];
/** Serials whose stops throw. */
export const throwing = new Set<number>();

/** On the finalizers' thread: what each stop held there, its structs before the sync point applied. */
export const release = Finalizer.create({ components: { with: [serial, place, marked, widget, label] } }, (row, { resources }) => {
    finalized.push(row.entity);
    released.push({ serial: row[serial], place: [...row[place]], marked: row[marked], widget: row[widget]?.tag ?? null, label: row[label]?.text ?? null, tone: resources[tone].text });
    if (throwing.has(row[serial])) throw new Error(`remoteFinalizersTest: ${row[serial]} throws`);
});

/** Every titled stop finalized on this thread, in order, with the title it read. */
export const entitled: { readonly serial: number; readonly title: string }[] = [];

/** On the finalizers' thread: what each titled stop's title was before its sync point applied. */
export const entitle = Finalizer.create({ components: { with: [serial, title, widget] } }, row => {
    entitled.push({ serial: row[serial], title: row[title] });
});

/** Every headed stop finalized on this thread, in order, with the heading it read. */
export const headlined: { readonly serial: number; readonly heading: string }[] = [];

/** On the finalizers' thread: the heading as it was before each headed stop's sync point applied. */
export const headline = Finalizer.create({ components: { with: [serial, widget, headed] } }, (row, { resources }) => {
    headlined.push({ serial: row[serial], heading: resources[heading] });
});

/** Every headed stop finalized on this thread, in order, with the heading and subheading it read. */
export const headlinedBoth: { readonly serial: number; readonly heading: string; readonly subheading: string }[] = [];

/** On the finalizers' thread: two string resources as they were before each headed stop's sync point applied. */
export const headlines = Finalizer.create({ components: { with: [serial, widget, headed] } }, (row, { resources }) => {
    headlinedBoth.push({ serial: row[serial], heading: resources[heading], subheading: resources[subheading] });
});

/** Every headed stop finalized on this thread, in order, with the linear resources it read. */
export const gauged: { readonly serial: number; readonly level: number; readonly origin: readonly number[] }[] = [];

/** On the finalizers' thread: a number and a struct resource as they were before each headed stop's sync point applied. */
export const gauge = Finalizer.create({ components: { with: [serial, widget, headed] } }, (row, { resources }) => {
    gauged.push({ serial: row[serial], level: resources[level], origin: [...resources[origin]] });
});

/** Every headed stop finalized on this thread, in order, with the resources of mixed widths it read. */
export type Surveyed = { readonly serial: number; readonly caption: string; readonly lit: boolean; readonly tint: readonly number[]; readonly sample: Sample; readonly material: Material };
export const surveyed: Surveyed[] = [];

/** On the finalizers' thread: resources of mixed widths as they were before each headed stop's sync point applied. */
export const survey = Finalizer.create({ components: { with: [serial, widget, headed] } }, (row, { resources }) => {
    const { alpha, color, glossy } = resources[material];
    surveyed.push({
        serial: row[serial], caption: resources[caption], lit: resources[lit], tint: [...resources[tint]],
        sample: { ...resources[sample] }, material: { alpha, color: [...color], glossy },
    });
});

/** What `regauge` writes to the resources of mixed widths at a level. */
export const surveyOf = (at: number): Omit<Surveyed, "serial"> => ({
    caption: `c${at}`, lit: at > 3, tint: [at, at + 0.5, at * 2],
    sample: { on: at > 3, count: at * 1000 + 1, weight: at + 0.25, ratio: at * 0.5 + 1 },
    material: { alpha: at * 0.25 + 1, color: [at + 1, at + 2, at + 3], glossy: at > 3 },
});

/** From the world's thread: the level, the origin at it, and the resources of mixed widths at it. */
export const regauge = System.create({  }, ({ resources }, input: { readonly level: number }) => {
    resources[level] = input.level;
    resources[origin] = [input.level, input.level + 10];
    const values = surveyOf(input.level);
    resources[caption] = values.caption;
    resources[lit] = values.lit;
    resources[tint] = [values.tint[0], values.tint[1], values.tint[2]];
    resources[sample] = values.sample;
    resources[material] = values.material;
});

/** Spawns headed rows from the world's thread, with the thread's widget at null. */
export const spawnHeaded = System.create({}, ({ commands }, input: { readonly from: number; readonly count: number }) => {
    for (let k = input.from; k < input.from + input.count; k++) commands.spawn([serial, headed, widget])({ [serial]: k, [widget]: null });
});
/** From the world's thread: the heading and subheading. */
export const rehead = System.create({  }, ({ resources }, input: { readonly heading: string }) => {
    resources[heading] = input.heading;
    resources[subheading] = `s${input.heading}`;
});

/** Spawns titled rows from the world's thread, with the thread's widget at null. */
export const spawnTitled = System.create({}, ({ commands }, input: { readonly from: number; readonly count: number }) => {
    for (let k = input.from; k < input.from + input.count; k++) commands.spawn([serial, title, widget])({ [serial]: k, [title]: `t${k}`, [widget]: null });
});
/** From the world's thread: every title as another of the same size, so the records of titles let go are reused. */
export const retitle = System.create({ components: { with: [title] } }, (row, _context, input: { readonly round: number }) => {
    row[title] = `r${input.round}`;
});

/** Spawns from the world's thread: structs, the thread's objects at null and their start. */
export const spawn = System.create({}, ({ commands }, input: { readonly from: number; readonly count: number }) => {
    for (let k = input.from; k < input.from + input.count; k++) commands.spawn([serial, place, marked, widget, label])({ [serial]: k, [place]: [k, -k], [widget]: null });
});
/** On the thread: widgets written in place. */
export const attach = System.create({ components: { with: [serial, widget] } }, row => {
    const tag = `w${row[serial]}`;
    row[widget] = { tag, draw: () => tag };
});
/** On the thread: labels given by command, staged there, for odd serials. */
export const relabel = System.create({ components: { with: [serial, label] } }, (row, { commands }) => {
    const relabelled = { text: `l${row[serial]}${row[label]?.text === "none" ? "" : "+"}` };
    if (row[serial] % 2 === 1) commands.add(row.entity, label, relabelled);
});
/** On the thread: its object resource. */
export const retone = System.create({  }, ({ resources }, input: { readonly tone: string }) => {
    resources[tone] = { text: input.tone };
});
/** From the world's thread: places move, so a stop's values are those before the sync point applies. */
export const shift = System.create({ components: { with: [place] } }, row => {
    row[place] = [row[place][0] + 100, row[place][1]];
});
/** From the world's thread: despawns these serials. */
export const despawn = System.create({ components: { with: [serial] } }, (row, { commands }, input: { readonly serials: readonly number[] }) => {
    if (input.serials.includes(row[serial])) commands.despawn(row.entity);
});
/** From the world's thread: removes widgets of these serials, a stop that despawns nothing. */
export const strip = System.create({ components: { with: [serial, widget] } }, (row, { commands }, input: { readonly serials: readonly number[] }) => {
    if (input.serials.includes(row[serial])) commands.remove(row.entity, widget);
});
/** From the world's thread: every row moves archetype, flagged on one run and not on the next. */
export const flag = System.create({ components: { with: [serial], not: [flagged] } }, (row, { commands }) => {
    commands.add(row.entity, flagged);
});
export const unflag = System.create({ components: { with: [serial, flagged] } }, (row, { commands }) => {
    commands.remove(row.entity, flagged);
});

/** Waits until `done` holds, letting other tasks run, for at most `milliseconds`. */
export const eventually = async (done: () => boolean | Promise<boolean>, milliseconds = 20000): Promise<boolean> => {
    const deadline = performance.now() + milliseconds;
    while (!await done() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    return done();
};

/** Stops in a comparable order: by serial, then as they came. */
export const sorted = (stops: readonly Released[]): readonly Released[] => stops.map((stop, k) => [stop, k] as const).sort((a, b) => a[0].serial - b[0].serial || a[1] - b[1]).map(([stop]) => stop);

/**
 * The runs both worlds take: spawns, widgets and labels given on the finalizers' thread, despawns and a removal in
 * sync points that move other rows into the stopped ones, a crowd moved past what a joined thread's log holds before
 * its despawns, and its object resource changed. `stops` is how many stops the finalizer has seen, wherever it runs;
 * each step waits until it saw `expected` of them, with what an inline world saw first.
 */
export const scenario = async (world: World, stops: () => number | Promise<number>, expected: readonly number[] = []): Promise<readonly number[]> => {
    const seen: number[] = [];
    const step = async (run: Promise<unknown>): Promise<void> => {
        await run;
        const wanted = expected[seen.length];
        if (wanted !== undefined) await eventually(async () => await stops() >= wanted);
        seen.push(await stops());
    };
    await step(world.run(spawn, { from: 0, count: 12 }));
    await step(world.run(attach));
    await step(world.run(relabel));
    await step(world.run(shift));
    await step(world.run(despawn, { serials: [1, 2, 5, 11] }));
    await step(world.run(strip, { serials: [3] }));
    await step(world.run(retone, { tone: "loud" }));
    await step(world.run(despawn, { serials: [3, 4] }));
    await step(world.run(spawn, { from: 100, count: 300 }));
    await step(world.run(attach));
    await step(world.run(relabel));
    for (let k = 0; k < 30; k++) await step(world.run(k % 2 === 0 ? flag : unflag));
    await step(world.run(despawn, { serials: [100, 101, 150, 299] }));
    await step(world.run(despawn, { serials: [6, 7] }));
    return seen;
};
