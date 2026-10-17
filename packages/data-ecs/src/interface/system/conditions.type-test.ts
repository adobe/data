import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const paused = 'conditionsTypeTest/paused';
const level = 'conditionsTypeTest/level';
const cache = 'conditionsTypeTest/cache';
const count = 'conditionsTypeTest/count';
const handle = 'conditionsTypeTest/handle';
const position = 'conditionsTypeTest/position';

declare module '@adobe/data-ecs' {
    export interface Resources {
        [paused]: { type: boolean };
        [level]: { type: { readonly size: number } | null };
        [cache]: { type: Map<string, number> | null };
        [count]: { type: number };
        [handle]: { type: Map<string, number> };
    }
    export interface Components {
        [position]: { type: number };
    }
}

// `is`: runs while each is neither null nor false, and reads it narrowed so.
System.create({ name: "conditionsTypeTest/loaded", resources: { is: [level, cache] } }, ({ resources }) => {
    check<Equal<typeof resources[typeof level], { readonly size: number }>>();
    check<Equal<typeof resources[typeof cache], Map<string, number>>>();
    // @ts-expect-error a condition is read-only
    resources[level] = null;
});
System.create({ name: "conditionsTypeTest/playing", resources: { is: [paused] } }, ({ resources }) => {
    check<Equal<typeof resources[typeof paused], true>>();
});

// `not`: runs while each is null or false; its value is known, so it isn't readable.
System.create({ name: "conditionsTypeTest/running", components: { write: [position] }, resources: { not: [paused] } }, (row, context) => {
    row[position] += 1;
    // @ts-expect-error a `not` condition isn't readable
    void context.resources;
});

// Only a resource whose type allows null or false is a condition.
// @ts-expect-error a number is never null or false
System.create({ name: "conditionsTypeTest/counted", resources: { is: [count] } }, () => {});
// @ts-expect-error a value that isn't data and doesn't allow null is never null
System.create({ name: "conditionsTypeTest/handled", resources: { not: [handle] } }, () => {});

// A condition is listed once: `is` already makes it readable, and a written value would have two types.
// @ts-expect-error both is and not
System.create({ name: "conditionsTypeTest/both", resources: { is: [paused], not: [paused] } }, () => {});
// @ts-expect-error is already makes it readable
System.create({ name: "conditionsTypeTest/read", resources: { is: [level], read: [level] } }, () => {});
// @ts-expect-error a condition isn't written
System.create({ name: "conditionsTypeTest/write", resources: { is: [level], write: [level] } }, () => {});

// Kernels and render systems take conditions too.
System.create({ name: "conditionsTypeTest/kernel", kernel: "cpu", components: { write: [position] }, resources: { not: [paused] } }, row => { row[position] += 1; });
System.render({ name: "conditionsTypeTest/draw", resources: { is: [level] }, shader: { accessors: { place: position } } }, () => {});
