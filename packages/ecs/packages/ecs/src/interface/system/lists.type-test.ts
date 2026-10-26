// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import { Entity, Index, System } from "@adobe/ecs";

const position = Symbol("listsTypeTest/position");
const velocity = Symbol("listsTypeTest/velocity");
const scale = Symbol("listsTypeTest/scale");
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
    }
    interface Resources {
        [scale]: { type: number };
    }
}

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expectType = <T extends true>(): T | undefined => undefined;

// A list of components declared `as const` is a tuple, an archetype wherever component lists go.
export const Particle = [position, velocity] as const;
expectType<Equal<typeof Particle, readonly [typeof position, typeof velocity]>>();
export const one: readonly Component.Key[] = Particle;
export const move = System.create({ components: { with: [...Particle] } }, row => { row[position] += row[velocity]; });
export const read = System.create({ observer: true, components: { with: [...Particle] } }, row => { void row[velocity]; });

// Declared without `as const`, a list's keys widen to `symbol`, which no list of components takes.
const loose = [position, velocity];
expectType<Equal<typeof loose, symbol[]>>();
// @ts-expect-error so it's never a list of components
export const looseList: readonly Component.Key[] = loose;
// @ts-expect-error nor an index's
export const byLoose = Index.create({ key: [position], components: { with: loose } });

/** A list whose components are known only at runtime says so by its type. */
const runtime: readonly (typeof position | typeof velocity)[] = Particle;

export const spawn = System.create(({ commands }) => {
    commands.spawn(Particle)({ [position]: 1, [velocity]: 2 });
    // @ts-expect-error a tuple's values are required
    commands.spawn(Particle)({ [position]: 1 });
    commands.spawn([position, velocity])({ [position]: 1, [velocity]: 2 });
    // @ts-expect-error a list declared without `as const` can't be spawned
    commands.spawn(loose);
    // @ts-expect-error nor added
    commands.add(Entity.none, loose, {});
    // A runtime list takes any of its values.
    commands.spawn(runtime)({ [position]: 1 });
    commands.add(Entity.none, Particle, { [position]: 1, [velocity]: 2 });
    // @ts-expect-error a resource is never in a list of components
    commands.spawn([position, scale]);
});
