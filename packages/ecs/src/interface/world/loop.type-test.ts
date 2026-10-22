// © 2026 Adobe. MIT License. See /LICENSE for details.
import {
    Finalizer, System, always, cadence, clock, gpuDevice, wake, workers,
    type Component, type Resource, type World,
} from '../index.js';
import type { Create } from './create.js';
import type * as Ecs from '../index.js';
import { main, move } from '../system/system.type-test.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const create: Create;

// Systems added to every tick take no input.
const added: void = world.add(main);
// @ts-expect-error a system with input can't be added, since ticks pass none
world.add(move);
void added;
// Removing takes a value passed to add, which takes no input.
const removed: void = world.remove(main);
// @ts-expect-error a system with input was never added
world.remove(move);
void removed;

// Built-in resources.
check<Equal<Resource.Value<typeof gpuDevice>, GPUDevice | null>>();
check<Equal<Resource.Value<typeof workers>, number | null>>();
// null is the platform's choice of pool size.
export const platformPool: World = create({ [workers]: null });
check<Equal<Resource.Value<typeof always>, boolean>>();
check<Equal<Resource.Value<typeof wake>, number>>();
check<Equal<Resource.Value<typeof clock>, { readonly now: number; readonly delta: number; readonly tick: number }>>();
check<Equal<Resource.Value<typeof cadence>, { readonly kind: "frame" } | { readonly kind: "fixed"; readonly step: number; readonly maxSteps?: number }>>();
// Built-in resources are symbols, so worlds start them at other values through their imported keys.
check<Equal<[typeof gpuDevice, typeof workers, typeof cadence, typeof always, typeof wake, typeof clock] extends readonly symbol[] ? true : false, true>>();
// @ts-expect-error a resource key is its imported symbol, never its description
create({ workers: 2 });

// There are no built-in components: a joined thread's progress is the implementation's.
type Removed = "component" | "persistent" | "shared" | "threadPort" | "threadStatus" | "threadClaims";
check<Equal<Extract<Removed, keyof typeof Ecs | Component.Key>, never>>();

// Systems read the loop's state, ask for a wake time and change its cadence.
System.create({ name: "loopTypeTest/read", resources: { read: [clock] } }, ({ resources }) => {
    const now: number = resources[clock].now;
    void now;
});
System.create({ name: "loopTypeTest/pace", resources: { write: [cadence, always] } }, ({ resources }) => {
    resources[cadence] = { kind: "fixed", step: 1000 / 60, maxSteps: 2 };
    resources[always] = true;
});
System.create({ name: "loopTypeTest/sleep", reduce: { [wake]: "min" } }, ({ reduce }) => { reduce[wake](1000); });
// @ts-expect-error clock is written only by the world
System.create({ name: "loopTypeTest/clock", resources: { write: [clock] } }, () => {});
// @ts-expect-error wake is reduced, never written
System.create({ name: "loopTypeTest/wake", resources: { write: [wake] } }, () => {});
// @ts-expect-error a finalizer doesn't write clock either
Finalizer.create({ name: "loopTypeTest/finalizeClock", components: {}, resources: { write: [clock] } }, () => {});
// @ts-expect-error a cadence is a frame or a fixed step
System.create({ name: "loopTypeTest/badCadence", resources: { write: [cadence] } }, ({ resources }) => { resources[cadence] = { kind: "fixed" }; });

// Worlds start the loop's settings at other values; clock is the world's own.
const paced: World = create({ [cadence]: { kind: "fixed", step: 10 }, [always]: true, [workers]: 2 });
// @ts-expect-error clock is written only by the world
create({ [clock]: { now: 0, delta: 0, tick: 0 } });
void paced;
