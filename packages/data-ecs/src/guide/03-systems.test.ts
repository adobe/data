import { expect, it } from "vitest";
import { Component, Report, Resource, System, Vec3 } from "../index.js";
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

// An observer system reads what the runs before it left, and changes nothing: run one to read the world, or add one to
// react to it.
const moved: Vec3[] = [];
let counted = 0;
const read = System.create({ observer: true, components: { read: [position], not: [frozen] }, resources: { read: [frames] } }, (row, { resources }) => {
    moved.push(row[position]);
    counted = resources[frames];
});

it("runs a system once per entity, or once", async () => {
    await using world = createWorld();
    // run: runs a system once.
    await world.run(spawn);
    await world.run(move);
    await world.run(count);
    await world.run(read);
    expect(moved).toEqual([[1, 0, 0]]);
    expect(counted).toBe(1);
});

const fail = System.create({ name: "fail" }, () => {
    throw new Error("broken");
});

// A run resolves to its number. A run or tick that went wrong has a report, an entity: an observer system added to
// read reports' failures as they change logs them. Observer systems' failures join their report after them.
const logged: string[] = [];
const logFailures = System.create({ observer: true, components: { read: [Report.failures], changed: [Report.failures] } }, row => {
    for (const failure of row[Report.failures]) logged.push(`${failure.name}: ${failure.message}`);
});

it("reports what failed as entities", async () => {
    await using world = createWorld();
    world.add(logFailures);
    const run: number = await world.run(fail);
    expect(run).toBe(1);
    expect(logged).toEqual(["fail: broken"]);
});
