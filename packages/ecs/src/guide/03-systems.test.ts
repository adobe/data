// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Report, System, Vec3, World } from "../index.js";

const position = Symbol();
const velocity = Symbol();
const frozen = Symbol();
const delta = Symbol();
const frames = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [frozen]: { type: true };
    }
    interface Resources {
        [delta]: { type: number; default: 0.5 };
        [frames]: { type: number; default: 0 };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([position, velocity])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
    commands.spawn([position, velocity, frozen])({ [position]: [0, 0, 0], [velocity]: [2, 0, 0] });
});

// Runs once per entity with every component in read and write, and none in not.
const move = System.create({
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
    await using world = World.create();
    // run: runs a system once.
    await world.run(spawn);
    await world.run(move);
    await world.run(count);
    await world.run(read);
    expect(moved).toEqual([[1, 0, 0]]);
    expect(counted).toBe(1);
});

const fail = System.create(() => {
    throw new Error("broken");
});

// A run resolves to its number. Every run and tick has a report, an entity: `Report.run` says what it ran and how long
// it took, and `Report.errors` is there only when something went wrong. An observer system added to follow errors as
// they change logs them; what observer systems throw is in the next run's report.
const logged: string[] = [];
const logFailures = System.create({ observer: true, components: { read: [Report.errors], changed: [Report.errors] } }, row => {
    for (const failure of row[Report.errors].failures) logged.push(`${failure.name}: ${failure.message}`);
});

it("reports what failed as entities", async () => {
    await using world = World.create();
    world.add(logFailures);
    const run: number = await world.run(fail);
    expect(run).toBe(1);
    expect(logged).toEqual(["fail: broken"]);
});
