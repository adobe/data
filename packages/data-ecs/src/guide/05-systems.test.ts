import { expect, it } from "vitest";
import { Component, Observe, Resource, System, Vec3 } from "../index.js";
import { createWorld } from "../implementation/index.js";

const position = Symbol("position");
const velocity = Symbol("velocity");
const frozen = Symbol("frozen");
const delta = Symbol("delta");
const frames = Symbol("frames");

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [frozen]: { type: true };
    }
    interface Resources {
        [delta]: { type: number };
        [frames]: { type: number };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(frozen, { type: { const: true } });
Resource.register(delta, { type: { type: "number", default: 0.5 } });
Resource.register(frames, { type: { type: "number", default: 0 } });

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
    commands.spawn([position, velocity, frozen])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
});

// Runs once per entity with every component in read and write, and none in not.
const move = System.create({
    // Optional: labels the system in reports.
    name: "physics/move",
    components: { read: [velocity], write: [position], not: [frozen] },
    resources: { read: [delta] },
}, (row, { resources }) => {
    // Values are replaced whole, never edited in place.
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], resources[delta]));
});

// Without components, a system runs once per run.
const count = System.create({ resources: { write: [frames] } }, ({ resources }) => {
    resources[frames] += 1;
});

it("runs a system once, or on every tick", async () => {
    await using world = createWorld();
    // run: runs a system once.
    await world.run(spawn);
    await world.run(move);
    const [moving] = await Observe.toPromise(world.observe.select({ required: [position], not: [frozen] }));
    expect((await Observe.toPromise(world.observe.entity(moving, { required: [position] })))?.[position]).toEqual([1, 0, 0]);

    // add: runs a system on every tick.
    world.add(count);
    // An observer is notified when its value changes, at most once per frame.
    const ticked = new Promise<number>(resolve => world.observe.resource(frames)(value => { if (value > 0) resolve(value); }));
    await world.run(spawn);
    expect(await ticked).toBeGreaterThan(0);
});
