// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Finalizer, System, World } from "../../index.js";
import { Observe } from "../../observe/index.js";
import { createWorld } from "../index.js";

const name = Symbol("changesFinalizers/name");
const score = Symbol("changesFinalizers/score");
const journal = Symbol("changesFinalizers/journal");

declare module "@adobe/ecs" {
    interface Components {
        [name]: { type: string };
        [score]: { type: number };
    }
    interface Resources {
        [journal]: { type: readonly string[]; default: [] };
    }
}


// A changes finalizer sees each sync point's structural changes to the components it watches, grouped by how
// they changed, with values before and after: for persistence, replication and undo.
Finalizer.changes({ name: "changesFinalizers/save", watch: [name, score], resources: { write: [journal] } }, (changes, { resources }) => {
    const lines = changes.groups.flatMap(group => group.entities.map(entity =>
        `${changes.previous(entity, name) ?? changes.next(entity, name)}: +${group.added.length} -${group.removed.length} score ${changes.previous(entity, score)} → ${changes.next(entity, score)}`));
    resources[journal] = [...resources[journal], ...lines];
});

const spawn = System.create({ name: "changesFinalizers/spawn" }, ({ commands }) => { commands.spawn([name, score])({ [name]: "ada", [score]: 3 }); });
const retire = System.create({ name: "changesFinalizers/retire", components: { has: [score] } }, (row, { commands }) => { commands.remove(row.entity, score); });

it("records each sync point's structural changes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(retire);
    expect(await Observe.toPromise(Observe.resource(world, journal))).toEqual(["ada: +2 -0 score null → 3", "ada: +0 -1 score 3 → null"]);
});
