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
export const move = System.create({ components: { with: [position] } }, (row, { resources }) => { row[position] += resources[scale]; });
export const show = System.create({ components: { with: [position, element] } }, row => { row[element].textContent = String(row[position]); });
export const all = System.create({ systems: [move, show] });
export const draw = System.render({ shader: { accessors: { place: position } } }, () => {});
export const release = Finalizer.create({ components: { with: [element] } }, row => { row[element].remove(); });
Rule.create({ components: { with: [position] }, derive: [slot] });
declare const create: Create;
declare const wgsl: typeof Gpu.wgsl;
export const world = create({ [workers]: 4, [gpuDevice]: null });
export const read = System.create({ observer: true, components: { with: [position, slot] } }, () => {});
export const readOne = System.create({ observer: true, lookup: { at: { with: [position, slot] } } }, () => {});
export const report = world.run(all);
export const shader = wgsl(draw);
export const added = world.add(read);

// Only types a consumer declares with are named; the rest are inferred where wanted.
// @ts-expect-error a thread's name is keyof Threads
export type NoThread = Ecs.Thread;
// @ts-expect-error the cadence's value is Resource.Type<typeof cadence>
export type NoCadence = Ecs.Cadence;
// @ts-expect-error a rule is the value Rule.create returns: ReturnType<typeof Rule.create>
export const noRule: Rule = Rule.create({ components: { with: [position] }, derive: [slot] });
// @ts-expect-error an archetype is a list of components declared as const
export const noArchetype: Ecs.Archetype = [position];
// @ts-expect-error a trait's key is keyof Traits<never, never>
export type NoTraitKey = Ecs.Trait.Key;
// @ts-expect-error observer systems read a world: no Observe
export type NoObserve = Ecs.Observe<number>;
// @ts-expect-error nor its helpers
export type NoToPromise = typeof Ecs.Observe.toPromise;
// @ts-expect-error nor what world.observe held
export type NoObservers = Ecs.Observers;
