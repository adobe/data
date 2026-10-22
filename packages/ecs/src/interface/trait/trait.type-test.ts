// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Resource } from '../resource/resource.js';
import type { Commands } from '../system/commands.js';
import type { IsStruct } from '../schema/is-struct.js';
import type { Components } from '../component/types.js';
import { Trait } from './trait.js';
import type { Derived, Essential } from '../component/value.js';
import type { Reduced } from '../resource/reduction.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// Traits other packages define: one only linear components take, one derived components don't need.
const gpuOnly = Symbol("traitTest/gpuOnly");
const nonPersistent = Symbol("traitTest/nonPersistent");
declare module '@adobe/ecs' {
    export interface Traits<N> {
        readonly [gpuOnly]: N extends Component.Key ? (IsStruct<Component.Value<N>> extends true ? true : never) : never;
        readonly [nonPersistent]: N extends Component.Key ? (Components[N] extends { readonly derived: true } ? never : true) : true;
    }
}
Trait.register(gpuOnly);
Trait.register(nonPersistent);
// @ts-expect-error string trait names are the core's built-in traits
Trait.register("derived");

const parent = Symbol("traitTest/parent");
const follows = Symbol("traitTest/follows");
const slot = Symbol("traitTest/slot");
const ready = Symbol("traitTest/ready");
const score = Symbol("traitTest/score");
const link = Symbol("traitTest/link");
const pair = Symbol("traitTest/pair");
const cache = Symbol("traitTest/cache");
const badReference = Symbol("traitTest/badReference");
const selfWithin = Symbol("traitTest/selfWithin");
const derivedWithin = Symbol("traitTest/derivedWithin");
const derivedReference = Symbol("traitTest/derivedReference");
const gpuString = Symbol("traitTest/gpuString");
const derivedNonPersistent = Symbol("traitTest/derivedNonPersistent");
const time = Symbol("traitTest/time");
const derivedResource = Symbol("traitTest/derivedResource");
const sum = Symbol("traitTest/sum");
const anyFlag = Symbol("traitTest/anyFlag");
const named = Symbol("traitTest/named");
const reducedComponent = Symbol("traitTest/reducedComponent");

declare module '@adobe/ecs' {
    export interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [follows]: { type: Entity; reference: "weak" };
        [slot]: { type: number; derived: true };
        [ready]: { type: true; within: typeof slot };
        [score]: { type: number };
        [link]: { type: { readonly to: Entity; readonly weight: number } };
        [pair]: { type: readonly [number, number]; [gpuOnly]: true };
        [cache]: { type: number; [nonPersistent]: true };
        [badReference]: { type: number; reference: "owner" };
        [selfWithin]: { type: true; within: typeof selfWithin };
        [derivedWithin]: { type: number; derived: true; within: typeof score };
        [derivedReference]: { type: Entity; derived: true; reference: "owner" };
        [gpuString]: { type: string; [gpuOnly]: true };
        [derivedNonPersistent]: { type: number; derived: true; [nonPersistent]: true };
        [reducedComponent]: { type: number; reduce: "+" };
    }
    export interface Resources {
        [time]: { type: number };
        [derivedResource]: { type: number; derived: true };
        [sum]: { type: number; reduce: "+" };
        [anyFlag]: { type: boolean; reduce: "+" };
        [named]: { type: string; reduce: "max" };
    }
}

// Registration takes exactly the declared traits, `type` as a schema for the declared type.
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(follows, { type: Entity.schema, reference: "weak" });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Component.register(ready, { type: { const: true }, within: slot });
Component.register(score, { type: { type: "number" } });
Component.register(link, { type: { type: "object", properties: { to: Entity.schema, weight: { type: "number" } } } });
Component.register(pair, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, [gpuOnly]: true });
Component.register(cache, { type: { type: "number" }, [nonPersistent]: true });
Resource.register(time, { type: { type: "number", default: 0 } });
Resource.register(sum, { type: { type: "number", default: 0 }, reduce: "+" });

// @ts-expect-error a derived component's type has a default, which it starts at
Component.register(slot, { type: { type: "number" }, derived: true });
// @ts-expect-error a reference's value is an entity
Component.register(badReference, { type: { type: "number" }, reference: "owner" });
// @ts-expect-error a component can't live within itself
Component.register(selfWithin, { type: { const: true }, within: selfWithin });
// @ts-expect-error a derived component's rule covers within
Component.register(derivedWithin, { type: { type: "number", default: 0 }, derived: true, within: score });
// @ts-expect-error a rule can't set a derived component's target
Component.register(derivedReference, { type: { ...Entity.schema, default: Entity.none }, derived: true, reference: "owner" });
// @ts-expect-error gpuOnly takes only linear components
Component.register(gpuString, { type: { type: "string" }, [gpuOnly]: true });
// @ts-expect-error nonPersistent is redundant on a derived component
Component.register(derivedNonPersistent, { type: { type: "number", default: 0 }, derived: true, [nonPersistent]: true });
// @ts-expect-error a declared trait is missing
Component.register(parent, { type: Entity.schema });
// @ts-expect-error an undeclared trait is given
Component.register(score, { type: { type: "number" }, derived: true });
// @ts-expect-error a trait's value differs from the declared one
Component.register(follows, { type: Entity.schema, reference: "owner" });
// @ts-expect-error an unknown trait
Component.register(score, { type: { type: "number" }, unknown: true });
// @ts-expect-error an entity's schema is Entity.schema
Component.register(parent, { type: { type: "integer" }, reference: "owner" });
// @ts-expect-error a number's schema isn't Entity.schema
Component.register(score, { type: Entity.schema });
// @ts-expect-error an entity field's schema is Entity.schema too
Component.register(link, { type: { type: "object", properties: { to: { type: "integer" }, weight: { type: "number" } } } });
// @ts-expect-error a resource's schema has a default
Resource.register(time, { type: { type: "number" } });
// @ts-expect-error derived is a component trait
Resource.register(derivedResource, { type: { type: "number", default: 0 }, derived: true });

// Types filter components by their traits and value types.
type Ours = typeof parent | typeof follows | typeof slot | typeof ready | typeof score | typeof link | typeof pair | typeof cache;
check<Equal<Component.Value<typeof parent>, Entity>>();
check<Equal<Component.Value<typeof link>, { readonly to: Entity; readonly weight: number }>>();
check<Equal<Extract<Component.With<"reference">, Ours>, typeof parent | typeof follows>>();
check<Equal<Extract<Component.With<"reference", "owner">, Ours>, typeof parent>>();
check<Equal<Extract<Derived, Ours>, typeof slot>>();
check<Equal<Extract<Component.With<typeof gpuOnly>, Ours>, typeof pair>>();
type Persisted = Exclude<Essential, Component.With<typeof nonPersistent>>;
check<Equal<Extract<Persisted, Ours>, Exclude<Ours, typeof slot | typeof cache>>>();
check<Equal<Resource.Value<typeof time>, number>>();

// Commands add and remove only essential components.
export const issue = (commands: Commands, entity: Entity): void => {
    commands.add(entity, [score, parent], { [score]: 1, [parent]: entity });
    commands.remove(entity, score);
    // @ts-expect-error derived components are added only by rules
    commands.spawn([slot])({ [slot]: 1 });
    // @ts-expect-error derived components are added only by rules
    commands.add(entity, slot, 1);
    // @ts-expect-error derived components are removed only by rules
    commands.remove(entity, slot);
};

// Entities are branded numbers.
const raw: number = Entity.none;
// @ts-expect-error a number isn't an entity
const forged: Entity = 3;
void raw;
void forged;
// @ts-expect-error booleans reduce bitwise
Resource.register(anyFlag, { type: { type: "boolean", default: false }, reduce: "+" });
// @ts-expect-error only numbers and booleans, and tuples and structs of them, are reduced
Resource.register(named, { type: { type: "string", default: "" }, reduce: "max" });
// @ts-expect-error reduce is a resource trait
Component.register(reducedComponent, { type: { type: "number" }, reduce: "+" });
check<Equal<Reduced & typeof sum, typeof sum>>();
check<Equal<Reduced & typeof time, never>>();
