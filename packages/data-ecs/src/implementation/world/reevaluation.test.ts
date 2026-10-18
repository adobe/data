import { expect, it } from "vitest";
import { System } from "../../index.js";
import { toPromise } from "../../interface/observe/to-promise.js";
import { bump, score } from "./reevaluation.test-helper.js";
import { createWorld } from "../index.js";

const spawn = System.create({ name: "reevaluation/spawn" }, ({ commands }) => { commands.spawn([score])({ [score]: 0 }); });

// A name is a label, so other code may use it too: this isn't 20-score.ts's `bump`, and reports label the two apart.
const broken = System.create({ name: "reevaluation/bump" }, () => {
    throw new Error("offline");
});

it("labels systems that share a name by their ids", async () => {
    await using world = createWorld();
    const { failures } = await world.run(broken);
    expect(failures.map(({ name }) => name)).toEqual(["reevaluation/bump (@adobe/data-ecs/src/implementation/world/reevaluation.test.ts#broken)"]);
});

it("matches the keys and systems of a module evaluated again by id", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(bump);
    // A query makes the module evaluate again, under the same ids, as an edit on a dev server does.
    const path = "./reevaluation.test-helper.js?again";
    const again: typeof import("./reevaluation.test-helper.js") = await import(/* @vite-ignore */ path);
    // Its key is the same component, and its system the same system, so a composite holds it once.
    await world.run(System.composite({ name: "reevaluation/both", systems: [bump, again.bump] }));
    const [entity] = await toPromise(world.observe.select({ required: [again.score] }));
    expect((await toPromise(world.observe.entity(entity, { required: [again.score] })))?.[again.score]).toBe(2);
});
