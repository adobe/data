import { Component } from "../../interface/component/component.js";
import { Resource } from "../../interface/resource/resource.js";
import { System } from "../../interface/system/system.js";
import type { Entity } from "../../interface/entity/entity.js";

// Keys and systems both threads of the synced-joined fixtures import: world systems writing every row's stamp each
// tick, and synced systems a joined thread adds, reading those rows as of one sync point.

export const stamp = Symbol("syncedJoinedWorkerTest/stamp");
export const spot = Symbol("syncedJoinedWorkerTest/spot");
export const counter = Symbol("syncedJoinedWorkerTest/counter");
export const stall = Symbol("syncedJoinedWorkerTest/stall");
declare module "@adobe/data-ecs" {
    export interface Components {
        [stamp]: { type: number };
        [spot]: { type: readonly [number, number, number] };
    }
    export interface Resources {
        [counter]: { type: number };
        [stall]: { type: number };
    }
}
Component.register(stamp, { type: { type: "integer" } });
Component.register(spot, { type: { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } });
Resource.register(counter, { type: { type: "integer", default: 0 } });
/** Milliseconds the synced systems spin partway through each run, so the world's next writer is ready before they finish. */
Resource.register(stall, { type: { type: "number", default: 0 } });

const spin = (milliseconds: number): void => {
    const until = performance.now() + milliseconds;
    while (performance.now() < until);
};

/** On the world's thread: the counter moves on once a tick, then every row's stamp and spot take it. */
export const count = System.create({ name: "syncedJoinedWorkerTest/count", resources: { write: [counter] } }, ({ resources }) => {
    resources[counter] += 1;
});
export const advance = System.create({ name: "syncedJoinedWorkerTest/advance", components: { write: [stamp, spot] }, resources: { read: [counter] }, after: [count] }, (row, { resources }) => {
    const value = resources[counter];
    row[stamp] = value;
    row[spot] = [value, -value, value];
});
export const ticked = System.create({ name: "syncedJoinedWorkerTest/ticked", systems: [count, advance] });
export const seed = System.create({ name: "syncedJoinedWorkerTest/seed", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let k = 0; k < input.count; k++) commands.spawn([stamp, spot])({ [stamp]: 0, [spot]: [0, 0, 0] });
});
export const setStall = System.create({ name: "syncedJoinedWorkerTest/setStall", input: { type: "object", properties: { pause: { type: "number" } } }, resources: { write: [stall] } }, ({ input, resources }) => {
    resources[stall] = input.pause;
});

/** What each run of a synced system saw: the counter, rows, and those not of that tick. */
export type Seen = { counter: number; rows: number; wrong: number };
export const seen: Seen[] = [];

/** Reads every row, which must all be of one tick, spinning after its first chunk while `stall` says so. */
export const watchRows = System.create({ name: "syncedJoinedWorkerTest/watchRows", synced: true, components: { read: [stamp, spot] }, resources: { read: [counter, stall] } }, (row, { resources }) => {
    const value = resources[counter];
    let last = seen.at(-1);
    if (last === undefined || last.counter !== value || last.rows === 1000) seen.push(last = { counter: value, rows: 0, wrong: 0 });
    const [x, y, z] = row[spot];
    if (row[stamp] !== value || x !== value || y !== -value || z !== value) last.wrong++;
    last.rows++;
    if (last.rows === 63) spin(resources[stall]);
});

/** The entities `lookRows` looks up, which the joined thread fills in. */
export const looked: Entity[] = [];

/** Looks up every row by entity, which must all be of one tick, spinning halfway while `stall` says so. */
export const lookRows = System.create({ name: "syncedJoinedWorkerTest/lookRows", synced: true, resources: { read: [counter, stall] }, lookup: { found: { read: [stamp, spot] } } }, ({ resources, lookup }) => {
    const value = resources[counter];
    const run: Seen = { counter: value, rows: 0, wrong: 0 };
    seen.push(run);
    for (let k = 0; k < looked.length; k++) {
        const found = lookup.found(looked[k]);
        if (found === null) continue;
        const [x, y, z] = found[spot];
        if (found[stamp] !== value || x !== value || y !== -value || z !== value) run.wrong++;
        run.rows++;
        if (k === looked.length >> 1) spin(resources[stall]);
    }
});
