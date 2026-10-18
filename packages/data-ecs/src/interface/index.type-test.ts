import { Component, Entity, Finalizer, Observe, Resource, Rule, System, gpuDevice, workers, type Gpu, type Thread, type World } from "@adobe/data-ecs";

// A consumer emits declarations for the values it makes from the public interface, naming no internal module.
export const position = Symbol("indexTypeTest/position");
export const slot = Symbol("indexTypeTest/slot");
export const element = Symbol("indexTypeTest/element");
export const scale = Symbol("indexTypeTest/scale");
declare module "@adobe/data-ecs" {
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
export const all = System.composite({ name: "indexTypeTest/all", systems: [move, show] });
export const draw = System.render({ name: "indexTypeTest/draw", shader: { accessors: { place: position } } }, () => {});
export const release = Finalizer.create({ name: "indexTypeTest/release", components: { read: [element] } }, row => { row[element].remove(); });
Rule.create({ name: "indexTypeTest/slots", components: { has: [position] }, derive: [slot] });
declare const create: World.Create;
declare const wgsl: typeof Gpu.wgsl;
export const world = create({ [workers]: 4, [gpuDevice]: null });
export const observeEntity = (entity: Entity) => world.observe.entity(entity, { required: [position], optional: [slot] });
export const device = world.observe.resource(gpuDevice);
export const pool = world.observe.resource(workers);
export const observe = world.observe;
export const query: World.Query<[typeof position]> = { required: [position], where: { [position]: { ">": 0 } } };
export const selected = world.observe.select(query);
export const counted = world.observe.count({ required: [position] });
export const report = world.run(all);
export const shader = wgsl(draw);
export const thread: Thread = "main";

// `Observe` is the type of an observer and the namespace of its helpers.
export const first: Promise<number> = Observe.toPromise(world.observe.resource(scale));
export const observed: Observe<number> = world.observe.resource(scale);
