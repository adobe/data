// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import { System } from '../system/system.js';
import { main, move, position, time, total, watchTime } from '../system/system.type-test.js';
import type { Create } from './create.js';
import type { World } from './world.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const entity: Entity;
declare const create: Create;

const point = Symbol("worldTypeTest/point");
const persistent = Symbol("worldTypeTest/persistent");
const shared = Symbol("worldTypeTest/shared");
declare module '@adobe/ecs' {
    export interface Components {
        [point]: { type: { readonly x: number } };
        [persistent]: { type: true };
        [shared]: { type: true };
    }
}
// Reading goes through observer systems: a world has no observers, and no synchronous reads.
// @ts-expect-error no observe: observer systems read a world
void world.observe;
// @ts-expect-error no synchronous reads
void world.query;
// @ts-expect-error no synchronous reads
void world.read;
// @ts-expect-error GPU writes are read back for observer systems, without synchronize
void world.synchronize;
// @ts-expect-error no World.Query: observer systems declare what they read
export type NoQuery = World.Query<[typeof persistent]>;

// A run resolves to its number; what went wrong is in its report (`Report`).
const ran: Promise<number> = world.run(main);
const moved: Promise<number> = world.run(move, { distance: 1 });
// @ts-expect-error a system with input needs it
world.run(move);
// @ts-expect-error input must match its schema
world.run(move, { distance: "far" });
// @ts-expect-error a system without input takes none
world.run(main, {});

const created: World = create();
const withResources: World = create({ [time]: 1, [total]: 0 });
// @ts-expect-error a resource's initial value has its type
create({ [time]: "now" });
// @ts-expect-error resources takes only resource keys
create({ [position]: 0 });
// @ts-expect-error a key is its symbol, never its description
create({ "systemTest/time": 1 });
// @ts-expect-error systems register on their first run
void world.systems;
const disposed: Promise<void> = world.dispose();
const usingDispose = async () => {
    await using scoped = create();
    await scoped.run(main);
};
void [disposed, usingDispose, ran, moved, created, withResources];

// How a world is created is the implementation's: World names no Create or InitialResources.
check<Equal<ReturnType<Create>, World>>();
// @ts-expect-error no World.Create
export type Created = World.Create;
// @ts-expect-error no World.InitialResources: Parameters<typeof createWorld>[0]
export type Initial = World.InitialResources;
// @ts-expect-error no World.Failure: Report.Failure
export type Failed = World.Failure;
// @ts-expect-error no World.Warning: Report.Warning
export type Warned = World.Warning;

// An observer system is added to every run and tick, or run once after an empty sync point.
const addedObserver: void = world.add(watchTime);
const ranObserver: Promise<number> = world.run(watchTime);
void [addedObserver, ranObserver];
