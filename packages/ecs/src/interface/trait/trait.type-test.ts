// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Resource } from '../resource/resource.js';
import type { Commands } from '../system/commands.js';
import type { IsStruct } from '../schema/is-struct.js';
import type { Components } from '../component/types.js';
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

const parent = Symbol("traitTest/parent");
const follows = Symbol("traitTest/follows");
const slot = Symbol("traitTest/slot");
const ready = Symbol("traitTest/ready");
const score = Symbol("traitTest/score");
const link = Symbol("traitTest/link");
const pair = Symbol("traitTest/pair");
const cache = Symbol("traitTest/cache");
const time = Symbol("traitTest/time");
const sum = Symbol("traitTest/sum");

declare module '@adobe/ecs' {
    export interface Components {
        [parent]: { type: Entity; reference: "owner" };
        [follows]: { type: Entity; reference: "weak" };
        [slot]: { type: number; derived: true; default: 0 };
        [ready]: { type: true; within: typeof slot };
        [score]: { type: number };
        [link]: { type: { readonly to: Entity; readonly weight: number } };
        [pair]: { type: readonly [number, number]; [gpuOnly]: true };
        [cache]: { type: number; [nonPersistent]: true };
    }
    export interface Resources {
        [time]: { type: number; default: 0 };
        [sum]: { type: number; default: 0; reduce: "+" };
    }
}

// The build registers each as declared; the registry checks the built-in traits when it does.

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
check<Equal<Reduced & typeof sum, typeof sum>>();
check<Equal<Reduced & typeof time, never>>();
