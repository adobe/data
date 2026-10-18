import { expect, it } from "vitest";
import { Component, Finalizer, Resource, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const name = Symbol("guide/changes/name");
const score = Symbol("guide/changes/score");
const journal = Symbol("guide/changes/journal");

declare module "@adobe/data-ecs" {
    interface Components {
        [name]: { type: string };
        [score]: { type: number };
    }
    interface Resources {
        [journal]: { type: readonly string[] };
    }
}

Component.register(name, { type: { type: "string" } });
Component.register(score, { type: { type: "number" } });
Resource.register(journal, { type: { type: "array", items: { type: "string" }, default: [] } });

// A changes finalizer sees each sync point's structural changes to the components it watches, grouped by how
// they changed, with values before and after: for persistence, replication and undo.
Finalizer.changes({ name: "guide/changes/save", watch: [name, score], resources: { write: [journal] } }, (changes, { resources }) => {
    const lines = changes.groups.flatMap(group => group.entities.map(entity =>
        `${changes.previous(entity, name) ?? changes.next(entity, name)}: +${group.added.length} -${group.removed.length} score ${changes.previous(entity, score)} → ${changes.next(entity, score)}`));
    resources[journal] = [...resources[journal], ...lines];
});

const spawn = System.create({ name: "guide/changes/spawn" }, ({ commands }) => { commands.spawn({ [name]: "ada", [score]: 3 }); });
const retire = System.create({ name: "guide/changes/retire", components: { has: [score] } }, (row, { commands }) => { commands.remove(row.entity, score); });

it("records each sync point's structural changes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(retire);
    expect(await toPromise(world.observe.resource(journal))).toEqual(["ada: +2 -0 score null → 3", "ada: +0 -1 score 3 → null"]);
});
