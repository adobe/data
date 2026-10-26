// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../index.js";
import { Observe } from "../../observe/index.js";
import { bump, score } from "./reevaluation.test-helper.js";
import { createWorld } from "../index.js";
import { runReported } from "./outcomes.test-helper.js";

const spawn = System.create({}, ({ commands }) => { commands.spawn([score])({ [score]: 0 }); });

// A label isn't an identity: this `bump` isn't the helper's, and reports tell the two apart by their ids.
const bump2 = System.create({}, () => {
    throw new Error("offline");
});

it("gives each system's id beside its label", async () => {
    await using world = createWorld();
    const { failures } = await runReported(world, bump2);
    expect(failures.map(({ name, id }) => [name, id])).toEqual([["bump2", expect.stringMatching(/^@adobe\/ecs@[^/]+\/src\/implementation\/world\/reevaluation\.test\.ts#bump2$/)]]);
});

it("matches the keys and systems of a module evaluated again by id", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(bump);
    // A query makes the module evaluate again, under the same ids, as an edit on a dev server does.
    const path = "./reevaluation.test-helper.js?again";
    const again: typeof import("./reevaluation.test-helper.js") = await import(/* @vite-ignore */ path);
    // Its key is the same component, and its system the same system, so a composite holds it once.
    await world.run(System.create({ systems: [bump, again.bump] }));
    const [entity] = await Observe.toPromise(Observe.select(world, { required: [again.score] }));
    expect((await Observe.toPromise(Observe.entity(world, entity, { required: [again.score] })))?.[again.score]).toBe(2);
});
