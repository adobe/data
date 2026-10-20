import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { Archetype, System } from "@adobe/data-ecs";

const position = Symbol("archetypeTypeTest/position");
const velocity = Symbol("archetypeTypeTest/velocity");
const scale = Symbol("archetypeTypeTest/scale");
declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
    }
    interface Resources {
        [scale]: { type: number };
    }
}
Component.register(position, { type: { type: "number" } });
Component.register(velocity, { type: { type: "number" } });
Resource.register(scale, { type: { type: "number", default: 0 } });

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const expectType = <T extends true>(): T | undefined => undefined;

// `create` returns its argument, typed as the tuple it was given.
export const particle = Archetype.create([position, velocity]);
expectType<Equal<typeof particle, readonly [typeof position, typeof velocity]>>();
export const one: readonly Component.Key[] = particle;
// A plain readonly list of components is an archetype too.
export const plain = [position] as const;
export const moveOver = System.create({ name: "archetypeTypeTest/moveOver", components: { write: plain } }, row => { row[position] += 1; });
// @ts-expect-error a resource is never in an archetype
Archetype.create([position, scale]);
// @ts-expect-error nor is a string
Archetype.create(["position"]);
// Archetypes go wherever component lists do.
export const move = System.create({ name: "archetypeTypeTest/move", components: { write: particle } }, row => { row[position] += row[velocity]; });
export const read = System.create({ name: "archetypeTypeTest/read", synced: true, components: { read: particle } }, row => { void row[velocity]; });
