// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component, Finalizer, Resource, Rule, System, gpuDevice, workers, type Gpu } from "@adobe/ecs";
import type * as Ecs from "@adobe/ecs";
import type { Create } from "./world/create.js";

// A consumer emits declarations for the values it makes from the public interface, naming no internal module.
export const position = Symbol("indexTypeTest/position");
export const slot = Symbol("indexTypeTest/slot");
export const element = Symbol("indexTypeTest/element");
export const scale = Symbol("indexTypeTest/scale");
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: number };
        [slot]: { type: number; derived: true };
        [element]: { type: HTMLElement; thread: "main" };
    }
    interface Resources {
        [scale]: { type: number };
    }
}
Component.register(position, { type: { type: "number" } });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Component.register(element, { thread: "main" });
Resource.register(scale, { type: { type: "number", default: 1 } });
export const move = System.create({ name: "indexTypeTest/move", components: { write: [position] }, resources: { read: [scale] } }, (row, { resources }) => { row[position] += resources[scale]; });
export const show = System.create({ name: "indexTypeTest/show", components: { read: [position], write: [element] } }, row => { row[element].textContent = String(row[position]); });
export const all = System.create({ name: "indexTypeTest/all", systems: [move, show] });
export const draw = System.render({ name: "indexTypeTest/draw", shader: { accessors: { place: position } } }, () => {});
export const release = Finalizer.create({ name: "indexTypeTest/release", components: { read: [element] } }, row => { row[element].remove(); });
Rule.create({ name: "indexTypeTest/slots", components: { has: [position] }, derive: [slot] });
declare const create: Create;
declare const wgsl: typeof Gpu.wgsl;
export const world = create({ [workers]: 4, [gpuDevice]: null });
export const read = System.create({ name: "indexTypeTest/read", observer: true, components: { read: [position, slot] }, resources: { read: [gpuDevice, workers] } }, () => {});
export const readOne = System.create({ observer: true, lookup: { at: { read: [position], has: [slot] } } }, () => {});
export const report = world.run(all);
export const shader = wgsl(draw);
export const added = world.add(read);

// Only types a consumer declares with are named; the rest are inferred where wanted.
// @ts-expect-error a thread's name is keyof Threads
export type NoThread = Ecs.Thread;
// @ts-expect-error the cadence's value is Resource.Value<typeof cadence>
export type NoCadence = Ecs.Cadence;
// @ts-expect-error a rule is the value Rule.create returns: ReturnType<typeof Rule.create>
export const noRule: Rule = Rule.create({ components: { has: [position] }, derive: [slot] });
// @ts-expect-error an archetype is a readonly list of components
export const noArchetype: Ecs.Archetype = [position];
// @ts-expect-error a trait's key is keyof Traits<never, never>
export type NoTraitKey = Ecs.Trait.Key;
// @ts-expect-error observer systems read a world: no Observe
export type NoObserve = Ecs.Observe<number>;
// @ts-expect-error nor its helpers
export type NoToPromise = typeof Ecs.Observe.toPromise;
// @ts-expect-error nor what world.observe held
export type NoObservers = Ecs.Observers;
