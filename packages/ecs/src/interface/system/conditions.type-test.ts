// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const paused = Symbol("conditionsTypeTest/paused");
const level = Symbol("conditionsTypeTest/level");
const cache = Symbol("conditionsTypeTest/cache");
const count = Symbol("conditionsTypeTest/count");
const handle = Symbol("conditionsTypeTest/handle");
const position = Symbol("conditionsTypeTest/position");

declare module '@adobe/ecs' {
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
System.create({ resources: { is: [level, cache] } }, ({ resources }) => {
    check<Equal<typeof resources[typeof level], { readonly size: number }>>();
    check<Equal<typeof resources[typeof cache], Map<string, number>>>();
    // @ts-expect-error a condition is read-only
    resources[level] = null;
});
System.create({ resources: { is: [paused] } }, ({ resources }) => {
    check<Equal<typeof resources[typeof paused], true>>();
});

// `not`: runs while each is null or false; its value is known, so it isn't readable.
System.create({ components: { write: [position] }, resources: { not: [paused] } }, (row, context) => {
    row[position] += 1;
    // @ts-expect-error a `not` condition isn't readable
    void context.resources;
});

// Only a resource whose type allows null or false is a condition.
// @ts-expect-error a number is never null or false
System.create({ resources: { is: [count] } }, () => {});
// @ts-expect-error a value that isn't data and doesn't allow null is never null
System.create({ resources: { not: [handle] } }, () => {});

// A condition is listed once: `is` already makes it readable, and a written value would have two types.
// @ts-expect-error both is and not
System.create({ resources: { is: [paused], not: [paused] } }, () => {});
// @ts-expect-error is already makes it readable
System.create({ resources: { is: [level], read: [level] } }, () => {});
// @ts-expect-error a condition isn't written
System.create({ resources: { is: [level], write: [level] } }, () => {});

// Kernels and render systems take conditions too.
System.create({ kernel: true, components: { write: [position] }, resources: { not: [paused] } }, row => { row[position] += 1; });
System.render({ resources: { is: [level] }, shader: { accessors: { place: position } } }, () => {});
