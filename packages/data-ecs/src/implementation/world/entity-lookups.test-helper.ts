import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";
import { fillReports } from "./reports.test-helper.js";

// Lookups by entity with `changed`, where systems run: probes on the world's thread, and on thread
// "entityLookupsTest", which a joined thread fills, as they read a probe's object there.

export const value = Symbol("entityLookupsTest/value");
export const other = Symbol("entityLookupsTest/other");
export const tag = Symbol("entityLookupsTest/tag");
export const extra = Symbol("entityLookupsTest/extra");
export const target = Symbol("entityLookupsTest/target");
export const label = Symbol("entityLookupsTest/label");
declare module "@adobe/data-ecs" {
    export interface Threads {
        entityLookupsTest: true;
    }
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
        [tag]: { type: true };
        [extra]: { type: number };
        [target]: { type: Entity };
        [label]: { type: string | null; thread: "entityLookupsTest" };
    }
}
Component.register(value, { type: { type: "number", precision: 1 } });
Component.register(other, { type: { type: "number" } });
Component.register(tag, { type: { const: true } });
Component.register(extra, { type: { type: "number" } });
Component.register(target, { type: Entity.schema });
Component.register(label, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "probe" }, thread: "entityLookupsTest" });

/**
 * What a probe saw of its target in one run: each lookup's `changed`, or null where it found nothing; the value it
 * read; whether a lookup with `changed` gave one row for two calls; whether lookups reading nothing gave one shared
 * row; and whether the entity a reused index held before was found.
 */
export type Seen = {
    readonly found: boolean | null;
    readonly value: number | null;
    readonly tagged: boolean | null;
    readonly reused: boolean;
    readonly shared: boolean;
    readonly stale: boolean;
};

/** The entity probes look up, the one its index held before, and every probe run's view, in order. */
export const scene: { subject: Entity; stale: Entity; seen: Seen[] } = { subject: Entity.none, stale: Entity.none, seen: [] };

/** One probe run's view of `subject`. */
const seenOf = (subject: Entity, lookup: {
    readonly found: (entity: Entity) => { readonly [value]: number; readonly changed: boolean } | null;
    readonly tagged: (entity: Entity) => { readonly changed: boolean } | null;
    readonly empty: (entity: Entity) => object | null;
    readonly has: (entity: Entity) => object | null;
}): Seen => {
    const found = lookup.found(subject);
    const changed = found?.changed ?? null;
    const read = found?.[value] ?? null;
    const reused = found !== null && lookup.found(subject) === found;
    const tagged = lookup.tagged(subject)?.changed ?? null;
    const empty = lookup.empty(subject);
    const has = lookup.has(subject);
    const stale = scene.stale !== Entity.none && lookup.found(scene.stale) !== null;
    return { found: changed, value: read, tagged, reused, shared: empty !== null && (has === null || has === empty), stale };
};

/** On the world's thread. */
export const probe = System.create({
    name: "entityLookupsTest/probe",
    components: { read: [target] },
    lookup: { found: { read: [value], changed: [value] }, tagged: { has: [tag], changed: [tag] }, empty: {}, has: { has: [tag] } },
}, (row, { lookup }) => {
    scene.seen.push(seenOf(row[target], lookup));
});

/** The same, registered later, so its first run comes after every change. */
export const lateProbe = System.create({
    name: "entityLookupsTest/lateProbe",
    components: { read: [target] },
    lookup: { found: { read: [value], changed: [value] }, tagged: { has: [tag], changed: [tag] }, empty: {}, has: { has: [tag] } },
}, (row, { lookup }) => {
    scene.seen.push(seenOf(row[target], lookup));
});

/** On thread "entityLookupsTest", as it reads the probe's label there. */
export const threadProbe = System.create({
    name: "entityLookupsTest/threadProbe",
    components: { read: [target, label] },
    lookup: { found: { read: [value], changed: [value] }, tagged: { has: [tag], changed: [tag] }, empty: {}, has: { has: [tag] } },
}, (row, { lookup }) => {
    if (row[label] === "probe") scene.seen.push(seenOf(row[target], lookup));
});

/** Writes every `value` in its rows, stamping them. */
export const bump = System.create({ name: "entityLookupsTest/bump", components: { write: [value] } }, row => {
    row[value] += 1;
});

/** The same as a kernel, whose stamps are muted unless something watches `value`. */
export const bumpKernel = System.create({ name: "entityLookupsTest/bumpKernel", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});

/** Writes every `other`, which no lookup watches. */
export const touch = System.create({ name: "entityLookupsTest/touch", components: { write: [other] } }, row => {
    row[other] += 1;
});

/** Changes the subject by command: `action` names how. */
export const edit = System.create({
    name: "entityLookupsTest/edit",
    input: { type: "object", properties: { action: { type: "string" } } },
}, ({ input, commands }) => {
    const { subject } = scene;
    switch (input.action) {
        case "spawn":
            scene.subject = commands.spawn([value, other, tag])({ [value]: 1, [other]: 0, [tag]: true });
            commands.spawn([target, label])({ [target]: scene.subject });
            break;
        case "set": commands.add(subject, value, 5); break;
        case "move": commands.add(subject, extra, 1); break;
        case "untag": commands.remove(subject, tag); break;
        case "retag": commands.add(subject, tag); break;
        case "despawn": commands.despawn(subject); break;
        case "reuse":
            scene.stale = subject;
            scene.subject = commands.spawn([value, tag])({ [value]: 7, [tag]: true });
            break;
    }
});

/** Points every probe at the subject. */
export const retarget = System.create({ name: "entityLookupsTest/retarget", components: { write: [target] } }, row => {
    row[target] = scene.subject;
});

/**
 * Runs the edits, `probe` after each: what every probe run saw, and the subject's index and generation before and
 * after its index was reused.
 */
export const scenario = async (world: World, probe: System): Promise<{ readonly seen: readonly Seen[]; readonly reused: boolean }> => {
    scene.subject = scene.stale = Entity.none;
    scene.seen = [];
    // Past the runs that spawn reports, whose entities would take the subject's freed index first.
    await fillReports(world);
    await world.run(edit, { action: "spawn" });
    // The first run, then one with nothing changed.
    await world.run(probe);
    await world.run(probe);
    // A write to the listed component, by a system and by command; one to another component.
    await world.run(bump);
    await world.run(probe);
    await world.run(edit, { action: "set" });
    await world.run(probe);
    await world.run(touch);
    await world.run(probe);
    // Moving to another archetype, then losing and gaining a listed component.
    await world.run(edit, { action: "move" });
    await world.run(probe);
    await world.run(edit, { action: "untag" });
    await world.run(probe);
    await world.run(edit, { action: "retag" });
    await world.run(probe);
    // Despawned, then its index reused by a new entity.
    await world.run(edit, { action: "despawn" });
    await world.run(probe);
    await world.run(edit, { action: "reuse" });
    await world.run(retarget);
    await world.run(probe);
    await world.run(probe);
    const reused = (scene.stale >>> 0) === (scene.subject >>> 0) && scene.stale !== scene.subject;
    return { seen: scene.seen, reused };
};

/** What `scenario` sees, run by run. */
export const expected: readonly Seen[] = [
    // First run: everything counts as changed.
    { found: true, value: 1, tagged: true, reused: true, shared: true, stale: false },
    { found: false, value: 1, tagged: false, reused: true, shared: true, stale: false },
    // bump
    { found: true, value: 2, tagged: false, reused: true, shared: true, stale: false },
    // set
    { found: true, value: 5, tagged: false, reused: true, shared: true, stale: false },
    // touch
    { found: false, value: 5, tagged: false, reused: true, shared: true, stale: false },
    // move: its values moved with it, unchanged
    { found: false, value: 5, tagged: false, reused: true, shared: true, stale: false },
    // untag: the lookup that has it finds nothing
    { found: false, value: 5, tagged: null, reused: true, shared: true, stale: false },
    // retag: added again, so changed
    { found: false, value: 5, tagged: true, reused: true, shared: true, stale: false },
    // despawn
    { found: null, value: null, tagged: null, reused: false, shared: false, stale: false },
    // reuse: a new entity in its index, the old one not found
    { found: true, value: 7, tagged: true, reused: true, shared: true, stale: false },
    { found: false, value: 7, tagged: false, reused: true, shared: true, stale: false },
];
