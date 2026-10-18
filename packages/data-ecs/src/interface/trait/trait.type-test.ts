import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Vec3 } from '../math/index.js';
import { Resource } from '../resource/resource.js';
import type { Commands } from '../system/commands.js';
import type { IsStruct } from '../schema/is-struct.js';
import { Trait } from './trait.js';
import type { Derived, Essential } from '../component/value.js';
import type { Reduced } from '../resource/reduction.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// Traits other packages define: one only linear components take, one derived components don't need.
const gpuOnly = Symbol("traitTest/gpuOnly");
const nonPersistent = Symbol("traitTest/nonPersistent");
declare module '@adobe/data-ecs' {
    export interface Traits<N, E> {
        readonly [gpuOnly]: N extends Component.Key ? (IsStruct<E["type"]> extends true ? true : never) : never;
        readonly [nonPersistent]: N extends Component.Key ? (E extends { readonly derived: true } ? never : true) : true;
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
const position = Symbol("traitTest/position");
const time = Symbol("traitTest/time");
const sum = Symbol("traitTest/sum");
const notComponent = Symbol("traitTest/notComponent");

// Registration returns the augment entry: the declaration's traits, `type` as the value type its schema describes.
const parentTraits = Component.register(parent, { type: Entity.schema, reference: "owner" });
const followsTraits = Component.register(follows, { type: Entity.schema, reference: "weak" });
const slotTraits = Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
const readyTraits = Component.register(ready, { type: { const: true }, within: slot });
const scoreTraits = Component.register(score, { type: { type: "integer" } });
const linkTraits = Component.register(link, { type: { type: "object", properties: { to: Entity.schema, weight: { type: "number" } } } });
const pairTraits = Component.register(pair, { type: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }, [gpuOnly]: true });
const cacheTraits = Component.register(cache, { type: { type: "number" }, [nonPersistent]: true });
const positionTraits = Component.register(position, { type: Vec3.schema });
const timeTraits = Resource.register(time, { type: { type: "number", default: 0 } });
const sumTraits = Resource.register(sum, { type: { type: "number", default: 0 }, reduce: "+" });

declare module '@adobe/data-ecs' {
    export interface Components {
        [parent]: typeof parentTraits;
        [follows]: typeof followsTraits;
        [slot]: typeof slotTraits;
        [ready]: typeof readyTraits;
        [score]: typeof scoreTraits;
        [link]: typeof linkTraits;
        [pair]: typeof pairTraits;
        [cache]: typeof cacheTraits;
        [position]: typeof positionTraits;
    }
    export interface Resources {
        [time]: typeof timeTraits;
        [sum]: typeof sumTraits;
    }
}

check<Equal<typeof parentTraits, { readonly type: Entity; readonly reference: "owner" }>>();
check<Equal<typeof slotTraits, { readonly type: number; readonly derived: true }>>();
check<Equal<typeof readyTraits, { readonly type: true; readonly within: typeof slot }>>();
check<Equal<typeof pairTraits, { readonly type: readonly [number, number]; readonly [gpuOnly]: true }>>();
check<Equal<typeof sumTraits, { readonly type: number; readonly reduce: "+" }>>();
// Value types follow schemas: Entity.schema is an Entity, wherever it is, and a fixed-length array is a tuple.
check<Equal<Component.Value<typeof parent>, Entity>>();
check<Equal<Component.Value<typeof score>, number>>();
check<Equal<Component.Value<typeof link>, { readonly to: Entity; readonly weight: number }>>();
check<Equal<Component.Value<typeof position>, Vec3>>();
check<Equal<Resource.Value<typeof time>, number>>();

// @ts-expect-error a derived component's type has a default, which it starts at
Component.register(slot, { type: { type: "number" }, derived: true });
// @ts-expect-error a reference's value is an entity
Component.register(score, { type: { type: "number" }, reference: "owner" });
// @ts-expect-error a component can't live within itself
Component.register(ready, { type: { const: true }, within: ready });
// @ts-expect-error within names a component
Component.register(ready, { type: { const: true }, within: time });
// @ts-expect-error a derived component's rule covers within
Component.register(slot, { type: { type: "number", default: 0 }, derived: true, within: score });
// @ts-expect-error a rule can't set a derived component's target
Component.register(parent, { type: { ...Entity.schema, default: Entity.none }, derived: true, reference: "owner" });
// @ts-expect-error gpuOnly takes only linear components
Component.register(score, { type: { type: "string" }, [gpuOnly]: true });
// @ts-expect-error nonPersistent is redundant on a derived component
Component.register(slot, { type: { type: "number", default: 0 }, derived: true, [nonPersistent]: true });
// @ts-expect-error an unknown trait
Component.register(score, { type: { type: "number" }, unknown: true });
// @ts-expect-error a type is a schema
Component.register(score, { type: { type: "decimal" } });
// @ts-expect-error a key is declared as a component to be registered as one
Component.register(notComponent, { type: { type: "number" } });
// @ts-expect-error a resource's schema has a default
Resource.register(time, { type: { type: "number" } });
// @ts-expect-error derived is a component trait
Resource.register(time, { type: { type: "number", default: 0 }, derived: true });

// Types filter components by their traits and value types.
type Ours = typeof parent | typeof follows | typeof slot | typeof ready | typeof score | typeof link | typeof pair | typeof cache;
check<Equal<Extract<Component.With<"reference">, Ours>, typeof parent | typeof follows>>();
check<Equal<Extract<Component.With<"reference", "owner">, Ours>, typeof parent>>();
check<Equal<Extract<Derived, Ours>, typeof slot>>();
check<Equal<Extract<Component.With<typeof gpuOnly>, Ours>, typeof pair>>();
type Persisted = Exclude<Essential, Component.With<typeof nonPersistent>>;
check<Equal<Extract<Persisted, Ours>, Exclude<Ours, typeof slot | typeof cache>>>();

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
Resource.register(time, { type: { type: "boolean", default: false }, reduce: "+" });
// @ts-expect-error only numbers and booleans, and tuples and structs of them, are reduced
Resource.register(time, { type: { type: "string", default: "" }, reduce: "max" });
// @ts-expect-error reduce is a resource trait
Component.register(score, { type: { type: "number" }, reduce: "+" });
check<Equal<Reduced & typeof sum, typeof sum>>();
check<Equal<Reduced & typeof time, never>>();
