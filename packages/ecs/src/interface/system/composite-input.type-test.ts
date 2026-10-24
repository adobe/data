// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from '../world/world.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const move = System.create({}, (_context, input: { readonly distance: number }) => { void input.distance; });
const step = System.create({}, (_context, input: { readonly distance: number; readonly dt: number }) => { void input.dt; });
const pause = System.create({}, (_context, input: { readonly dt?: number }) => { void input.dt; });
const label = System.create({}, (_context, input: { readonly distance: string }) => { void input.distance; });
const idle = System.create({}, () => {});

// A composite takes every field its members' inputs have; a field in several is one value for all of them.
const frame = System.create({ systems: [move, step, idle] });
check<Equal<typeof frame, System<{ readonly distance: number; readonly dt: number }>>>();

// A field optional in one member and required in another is required.
const paused = System.create({ systems: [pause, step] });
check<Equal<typeof paused, System<{ readonly dt: number; readonly distance: number }>>>();

// Nested composites take their members' fields too.
const outer = System.create({ systems: [System.create({ systems: [move] }), pause] });
check<Equal<typeof outer, System<{ readonly distance: number; readonly dt?: number }>>>();

// A composite without constraints is its list of members.
const listed = System.create([move, step, idle]);
check<Equal<typeof listed, System<{ readonly distance: number; readonly dt: number }>>>();
const constrained = System.create({ systems: [pause], after: [listed] });
check<Equal<typeof constrained, System<{ readonly dt?: number }>>>();

// Without inputs, a composite takes none.
const quiet = System.create({ systems: [idle] });
check<Equal<typeof quiet, System>>();

// @ts-expect-error a field with different types in two members is an error at the member
System.create({ systems: [move, label] });
// @ts-expect-error in a list of members too
System.create([move, label]);
// @ts-expect-error a composite declaration lists its systems
System.create({ after: [move] });

declare const world: World;
void world.run(frame, { distance: 1, dt: 0.5 });
// @ts-expect-error run takes every field
void world.run(frame, { distance: 1 });

