// © 2026 Adobe. MIT License. See /LICENSE for details.
import type * as Ecs from '../index.js';
import { gpuDevice } from '../resources/gpu-device.js';
import { System } from '../system/system.js';
import { integrate, main, move, position, time, watchTime } from '../system/system.type-test.js';
import type { World } from './world.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const ecs: typeof Ecs;

const frames = Symbol("runTypeTest/frames");
declare module '@adobe/ecs' {
    export interface Resources {
        [frames]: { type: number };
    }
}

// A run resolves to its per-run body's value: a one-off read is an observer system returning it.
const count = System.create({ readonly: true }, ({ resources }) => resources[frames]);
check<Equal<typeof count, System<undefined, number>>>();
const counted: Promise<number> = world.run(count);
// @ts-expect-error a run of it resolves to a number
const notText: Promise<string> = world.run(count);

// A system that declares nothing, and one taking input, resolve to what their bodies return.
const next = System.create(({ resources }) => resources[frames] + 1);
const nextValue: Promise<number> = world.run(next);
const scaled = System.create({}, ({ resources }, input: { readonly by: number }) => ({ scaled: resources[frames] * input.by }));
const scaledValue: Promise<{ scaled: number }> = world.run(scaled, { by: 2 });

// A body that may be skipped, as one whose conditions or resource change filters can fail, may give undefined.
const changedFrames = System.create({ readonly: true, resources: { changed: [frames] } }, ({ resources }) => resources[frames]);
check<Equal<typeof changedFrames, System<undefined, number | undefined>>>();
const whileDevice = System.create({ resources: { is: [gpuDevice] } }, () => "drawn");
const drawn: Promise<string | undefined> = world.run(whileDevice);

// Row systems, composites, render systems and bodies returning nothing resolve to nothing.
const rows: Promise<void> = world.run(integrate);
const composite: Promise<void> = world.run(main);
const input: Promise<void> = world.run(move, { distance: 1 });
const nothing: Promise<void> = world.run(watchTime);
const valuedRows = System.create({ components: { with: [position] } }, row => row[position]);
check<Equal<typeof valuedRows, System>>();
check<Equal<typeof main, System>>();
check<Equal<typeof watchTime, System>>();
const drawing = System.render({ shader: { accessors: { place: position } } }, () => {});
check<Equal<typeof drawing, System>>();

// What a body returns doesn't change where a system goes: composites and constraints take it, and so do ticks.
const reads = System.create([count, integrate]);
check<Equal<typeof reads, System>>();
System.create({ after: [count] }, () => {});
world.add(count);
world.add(next);

// A run that fails rejects with an Error naming what failed; nothing else describes a run, so there's no Report.
// @ts-expect-error runs give their body's value and reject with what failed: no Report
void ecs.Report;
// @ts-expect-error no run numbers
const numbered: Promise<number> = world.run(main);

void [counted, notText, nextValue, scaledValue, drawn, rows, composite, input, nothing, numbered, time];

// A body returns no promise: it starts the work, and a later run finishes it.
// @ts-expect-error a body returns no promise
System.create(() => Promise.resolve(1));
// @ts-expect-error a body returns no promise
System.create({ readonly: true }, () => Promise.resolve(1));
// @ts-expect-error a body returns no promise, a row system's neither
System.create({ components: { with: [position] } }, () => Promise.resolve());
// @ts-expect-error a body returns no promise, a render system's neither
System.render({ shader: { accessors: { place: position } } }, () => Promise.resolve());
const thenable: PromiseLike<number> = Promise.resolve(1);
// @ts-expect-error nor any PromiseLike
System.create(() => thenable);
// @ts-expect-error nor a return type wide enough to hide one, unknown
System.create((): unknown => Promise.resolve(1));
// @ts-expect-error or object
System.create((): object => Promise.resolve(1));
// @ts-expect-error a row body's neither
System.create({ components: { with: [position] } }, (): unknown => Promise.resolve());
// Values of other types are a body's to return.
System.create(() => ({}));
System.create((): { readonly then?: never } => ({}));
