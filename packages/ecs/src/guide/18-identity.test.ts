// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Report, System, World } from "../index.js";

// A key, system, index, rule or finalizer is the value its constructor returns: two written alike are two, and code
// written apart can't collide. The build gives each one bound at a module's top level an id from where it's declared,
// its package's name and version, its module's path and its binding, so other threads and a module evaluated again
// by hot reload name the same one.
const explode = System.create(() => {
    throw new Error("boom");
});

// Reports label it by its binding, and give the id beside it to tell two of one label apart.
const failures: string[] = [];
const logFailures = System.create({ observer: true, components: { with: [Report.errors], changed: [Report.errors] } }, row => {
    for (const failure of row[Report.errors].failures) failures.push(`${failure.name} ${failure.id}`);
});

it("labels systems by their binding and id", async () => {
    await using world = World.create();
    world.add(logFailures);
    await world.run(explode);
    expect(failures).toEqual([expect.stringMatching(/^explode @adobe\/ecs@[^/]+\/src\/guide\/18-identity\.test\.ts#explode$/)]);
});
