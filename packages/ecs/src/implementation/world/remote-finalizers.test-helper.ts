// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";

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
declare module "@adobe/ecs" {
    export interface Threads {
        remoteFinalizersTest: true;
    }
    export interface Components {
        [serial]: { type: number };
        [place]: { type: readonly [number, number] };
        [marked]: { type: true };
        [flagged]: { type: true };
        [widget]: { type: Widget | null; thread: "remoteFinalizersTest" };
        [label]: { type: { readonly text: string } | null; thread: "remoteFinalizersTest" };
        [title]: { type: string };
    }
    export interface Resources {
        [tone]: { type: { readonly text: string }; thread: "remoteFinalizersTest" };
    }
}
/** A value that isn't data, which only its thread holds. */
type Widget = { readonly tag: string; readonly draw: () => string };
Component.register(serial, { type: { type: "integer" } });
Component.register(place, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 } });
Component.register(marked, { type: { const: true } });
Component.register(flagged, { type: { const: true } });
Component.register(widget, { thread: "remoteFinalizersTest" });
const text = { type: "object", properties: { text: { type: "string" } } } as const;
Component.register(label, { type: { anyOf: [text, { type: "null" }], default: { text: "none" } }, thread: "remoteFinalizersTest" });
Resource.register(tone, { type: { ...text, default: { text: "quiet" } }, thread: "remoteFinalizersTest" });
/** A string, in shared memory, which the world's thread writes and the finalizer on the thread reads. */
Component.register(title, { type: { type: "string" } });

/** A stop as the finalizer saw it, on the thread it ran on. */
export type Released = { readonly serial: number; readonly place: readonly number[]; readonly marked: boolean; readonly widget: string | null; readonly label: string | null; readonly tone: string };

/** Every stop finalized on this thread, in order, with the entity each was. */
export const released: Released[] = [];
export const finalized: Entity[] = [];
/** Serials whose stops throw. */
export const throwing = new Set<number>();

/** On the finalizers' thread: what each stop held there, its structs before the sync point applied. */
export const release = Finalizer.create({ name: "remoteFinalizersTest/release", components: { read: [serial, place, marked, widget, label] }, resources: { read: [tone] } }, (row, { resources }) => {
    finalized.push(row.entity);
    released.push({ serial: row[serial], place: [...row[place]], marked: row[marked], widget: row[widget]?.tag ?? null, label: row[label]?.text ?? null, tone: resources[tone]?.text });
    if (throwing.has(row[serial])) throw new Error(`remoteFinalizersTest: ${row[serial]} throws`);
});

/** Every titled stop finalized on this thread, in order, with the title it read. */
export const entitled: { readonly serial: number; readonly title: string }[] = [];

/** On the finalizers' thread: what each titled stop's title was before its sync point applied. */
export const entitle = Finalizer.create({ name: "remoteFinalizersTest/entitle", components: { read: [serial, title, widget] } }, row => {
    entitled.push({ serial: row[serial], title: row[title] });
});

/** Spawns titled rows from the world's thread, with the thread's widget at null. */
export const spawnTitled = System.create({ name: "remoteFinalizersTest/spawnTitled" }, ({ commands }, input: { readonly from: number; readonly count: number }) => {
    for (let k = input.from; k < input.from + input.count; k++) commands.spawn([serial, title, widget])({ [serial]: k, [title]: `t${k}`, [widget]: null });
});
/** From the world's thread: every title as another of the same size, so the records of titles let go are reused. */
export const retitle = System.create({ name: "remoteFinalizersTest/retitle", components: { write: [title] } }, (row, _context, input: { readonly round: number }) => {
    row[title] = `r${input.round}`;
});

/** Spawns from the world's thread: structs, the thread's objects at null and their start. */
export const spawn = System.create({ name: "remoteFinalizersTest/spawn" }, ({ commands }, input: { readonly from: number; readonly count: number }) => {
    for (let k = input.from; k < input.from + input.count; k++) commands.spawn([serial, place, marked, widget, label])({ [serial]: k, [place]: [k, -k], [widget]: null });
});
/** On the thread: widgets written in place. */
export const attach = System.create({ name: "remoteFinalizersTest/attach", components: { read: [serial], write: [widget] } }, row => {
    const tag = `w${row[serial]}`;
    row[widget] = { tag, draw: () => tag };
});
/** On the thread: labels given by command, staged there, for odd serials. */
export const relabel = System.create({ name: "remoteFinalizersTest/relabel", components: { read: [serial, label] } }, (row, { commands }) => {
    const relabelled = { text: `l${row[serial]}${row[label]?.text === "none" ? "" : "+"}` };
    if (row[serial] % 2 === 1) commands.add(row.entity, label, relabelled);
});
/** On the thread: its object resource. */
export const retone = System.create({ name: "remoteFinalizersTest/retone", resources: { write: [tone] } }, ({ resources }, input: { readonly tone: string }) => {
    resources[tone] = { text: input.tone };
});
/** From the world's thread: places move, so a stop's values are those before the sync point applies. */
export const shift = System.create({ name: "remoteFinalizersTest/shift", components: { write: [place] } }, row => {
    row[place] = [row[place][0] + 100, row[place][1]];
});
/** From the world's thread: despawns these serials. */
export const despawn = System.create({ name: "remoteFinalizersTest/despawn", components: { read: [serial] } }, (row, { commands }, input: { readonly serials: readonly number[] }) => {
    if (input.serials.includes(row[serial])) commands.despawn(row.entity);
});
/** From the world's thread: removes widgets of these serials, a stop that despawns nothing. */
export const strip = System.create({ name: "remoteFinalizersTest/strip", components: { read: [serial], has: [widget] } }, (row, { commands }, input: { readonly serials: readonly number[] }) => {
    if (input.serials.includes(row[serial])) commands.remove(row.entity, widget);
});
/** From the world's thread: every row moves archetype, flagged on one run and not on the next. */
export const flag = System.create({ name: "remoteFinalizersTest/flag", components: { has: [serial], not: [flagged] } }, (row, { commands }) => {
    commands.add(row.entity, flagged);
});
export const unflag = System.create({ name: "remoteFinalizersTest/unflag", components: { has: [serial, flagged] } }, (row, { commands }) => {
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
