import type { World } from '../world/world.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const move = System.create({
    name: "compositeInputTest/move",
    input: { type: "object", properties: { distance: { type: "number" } } },
}, ({ input }) => { void input.distance; });
const step = System.create({
    name: "compositeInputTest/step",
    input: { type: "object", properties: { distance: { type: "number" }, dt: { type: "number" } } },
}, ({ input }) => { void input.dt; });
const pause = System.create({
    name: "compositeInputTest/pause",
    input: { type: "object", properties: { dt: { type: "number" } }, required: [] },
}, ({ input }) => { void input.dt; });
const label = System.create({
    name: "compositeInputTest/label",
    input: { type: "object", properties: { distance: { type: "string" } } },
}, ({ input }) => { void input.distance; });
const idle = System.create({ name: "compositeInputTest/idle" }, () => {});

// A composite takes every field its members' inputs have; a field in several is one value for all of them.
const frame = System.composite({ name: "compositeInputTest/frame", systems: [move, step, idle] });
check<Equal<typeof frame, System<{ readonly distance: number; readonly dt: number }>>>();

// A field optional in one member and required in another is required.
const paused = System.composite({ name: "compositeInputTest/paused", systems: [pause, step] });
check<Equal<typeof paused, System<{ readonly dt: number; readonly distance: number }>>>();

// Nested composites take their members' fields too.
const outer = System.composite({ name: "compositeInputTest/outer", systems: [System.composite({ name: "compositeInputTest/inner", systems: [move] }), pause] });
check<Equal<typeof outer, System<{ readonly distance: number; readonly dt?: number }>>>();

// Without inputs, a composite takes none.
const quiet = System.composite({ name: "compositeInputTest/quiet", systems: [idle] });
check<Equal<typeof quiet, System>>();

// @ts-expect-error a field with different types in two members is an error at the member
System.composite({ name: "compositeInputTest/conflict", systems: [move, label] });

declare const world: World;
void world.run(frame, { distance: 1, dt: 0.5 });
// @ts-expect-error run takes every field
void world.run(frame, { distance: 1 });

System.create({
    name: "compositeInputTest/scalar",
    // @ts-expect-error input is an object of named fields
    input: { type: "number" },
}, () => {});
