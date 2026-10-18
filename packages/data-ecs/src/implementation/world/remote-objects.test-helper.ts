import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import type { Observe } from "../../interface/observe/observe.js";
import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";

// Keys and systems both threads of the remote objects fixtures import: objects of thread "remoteObjects", which a
// joined worker fills, and what it sees of them while the world applies sync points back to back.

export const serial = Symbol("remoteObjectsTest/serial");
export const phase = Symbol("remoteObjectsTest/phase");
export const flag = Symbol("remoteObjectsTest/flag");
export const caption = Symbol("remoteObjectsTest/caption");
declare module "@adobe/data-ecs" {
    export interface Threads {
        remoteObjects: true;
    }
    export interface Components {
        [serial]: { type: number };
        [phase]: { type: number };
        [flag]: { type: true };
        [caption]: { type: string | null; thread: "remoteObjects" };
    }
}
Component.register(serial, { type: { type: "number" } });
Component.register(phase, { type: { type: "number" } });
Component.register(flag, { type: { const: true } });
Component.register(caption, { type: { anyOf: [{ type: "string" }, { type: "null" }], default: "none" }, thread: "remoteObjects" });

/** The watched entity, serial 0. */
export const seed = System.create({ name: "remoteObjectsTest/seed" }, ({ commands }) => {
    commands.spawn([serial, phase, caption])({ [serial]: 0, [phase]: 0 });
});

/**
 * Every tick: the watched entity's phase moves on, and its caption and flag follow it at the sync point, null and
 * flagged when it's odd, so it moves archetype every tick; the other entities despawn, and four more spawn into its
 * archetypes, so rows swap into the holes they leave.
 */
export const churn = System.create({ name: "remoteObjectsTest/churn", components: { read: [serial], write: [phase] } }, (row, { commands }) => {
    if (row[serial] !== 0) {
        commands.despawn(row.entity);
        return;
    }
    const next = row[phase] + 1;
    row[phase] = next;
    if (next % 2 === 1) {
        commands.add(row.entity, flag);
        commands.add(row.entity, caption, null);
    }
    else {
        commands.remove(row.entity, flag);
        commands.add(row.entity, caption, "none");
    }
    for (let k = 1; k <= 4; k++) {
        if (k % 2 === 0) commands.spawn([serial, phase, caption])({ [serial]: k, [phase]: 0, [caption]: null });
        else commands.spawn([serial, phase, caption, flag])({ [serial]: k, [phase]: 0 });
    }
});

/** What a joined thread saw of the watched entity's objects: values, those whose objects disagreed with its structs, and captions seen. */
export type Watched = { readonly values: number; readonly inconsistent: number; readonly captions: readonly (string | null)[] };

/** Watches `entity` until `count` values came, listed and whole, checking each value's objects agree with its structs. */
export const watch = (remote: World, entity: Entity, count: number): Promise<Watched> => new Promise(resolve => {
    let values = 0;
    let inconsistent = 0;
    const captions = new Set<string | null>();
    const stops: (() => void)[] = [];
    const seen = (odd: boolean, held: boolean, text: string | null | undefined): void => {
        values++;
        if (text !== undefined) captions.add(text);
        if (held !== odd || text !== (odd ? null : "none")) inconsistent++;
        if (values !== count) return;
        queueMicrotask(() => { for (const stop of stops) stop(); });
        resolve({ values, inconsistent, captions: [...captions].sort() });
    };
    const listed: Observe<{ readonly [phase]: number; readonly [caption]: string | null; readonly [flag]?: true } | null> = remote.observe.entity(entity, { required: [phase, caption], optional: [flag] });
    stops.push(listed(value => {
        if (value !== null && values < count) seen(value[phase] % 2 === 1, value[flag] === true, value[caption]);
    }));
    stops.push(remote.observe.entity(entity)(value => {
        if (value !== null && values < count) seen(Number(value[phase]) % 2 === 1, value[flag] === true, value[caption]);
    }));
});
