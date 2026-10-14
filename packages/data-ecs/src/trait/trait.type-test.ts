import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Resource } from '../resource/resource.js';
import type { Commands } from '../system/commands.js';
import type { IsLinear } from '../system/linear.js';
import type { Components } from '../component/types.js';
import { Trait } from './trait.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// Traits other packages define: one only linear components take, one derived components don't need.
const gpuOnly = "traitTest/gpuOnly";
const nonPersistent = Symbol("traitTest/nonPersistent");
declare module '@adobe/data-ecs' {
    export interface Traits<N> {
        readonly [gpuOnly]: N extends Component.Name ? (IsLinear<Component.Value<N>> extends true ? true : never) : never;
        readonly [nonPersistent]: N extends Component.Name ? (Components[N] extends { readonly derived: true } ? never : true) : true;
    }
}
Trait.register(gpuOnly);
Trait.register(nonPersistent);

const parent = "traitTest/parent";
const follows = "traitTest/follows";
const slot = "traitTest/slot";
const ready = "traitTest/ready";
const score = "traitTest/score";
const link = "traitTest/link";
const pair = "traitTest/pair";
const cache = "traitTest/cache";
const badReference = "traitTest/badReference";
const selfWithin = "traitTest/selfWithin";
const derivedWithin = "traitTest/derivedWithin";
const derivedReference = "traitTest/derivedReference";
const gpuString = "traitTest/gpuString";
const derivedNonPersistent = "traitTest/derivedNonPersistent";
const time = "traitTest/time";
const derivedResource = "traitTest/derivedResource";

declare module '@adobe/data-ecs' {
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
    }
    export interface Resources {
        [time]: { type: number };
        [derivedResource]: { type: number; derived: true };
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
check<Equal<Extract<Component.Where<Entity>, Ours>, typeof parent | typeof follows>>();
check<Equal<Extract<Component.Derived, Ours>, typeof slot>>();
check<Equal<Extract<Component.With<typeof gpuOnly>, Ours>, typeof pair>>();
type Persisted = Exclude<Component.Essential, Component.With<typeof nonPersistent>>;
check<Equal<Extract<Persisted, Ours>, Exclude<Ours, typeof slot | typeof cache>>>();
check<Equal<Resource.Value<typeof time>, number>>();

// Commands add and remove only essential components.
export const issue = (commands: Commands, entity: Entity): void => {
    commands.add(entity, { [score]: 1, [parent]: entity });
    commands.remove(entity, score);
    // @ts-expect-error derived components are added only by rules
    commands.spawn({ [slot]: 1 });
    // @ts-expect-error derived components are added only by rules
    commands.add(entity, { [slot]: 1 });
    // @ts-expect-error derived components are removed only by rules
    commands.remove(entity, slot);
};

// Entities are branded numbers.
const raw: number = Entity.none;
// @ts-expect-error a number isn't an entity
const forged: Entity = 3;
void raw;
void forged;
