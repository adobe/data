import { expect, it } from "vitest";
import { Component, Finalizer, Resource, System, World } from "../index.js";

const name = "guide/changes/name";
const score = "guide/changes/score";
const journal = "guide/changes/journal";

declare module "../component/types.js" {
    interface Types {
        [name]: { type: string };
        [score]: { type: number };
    }
}
declare module "../resource/types.js" {
    interface Types {
        [journal]: { type: readonly string[] };
    }
}
declare module "../finalizer/types.js" {
    interface Types {
        "guide/changes/save": true;
    }
}
declare module "../system/types.js" {
    interface Types {
        "guide/changes/spawn": true;
        "guide/changes/retire": true;
    }
}

Component.register(name, { type: { type: "string" } });
Component.register(score, { type: { type: "number" } });
Resource.register(journal, { type: { type: "array", items: { type: "string" }, default: [] } });

// A changes finalizer sees each sync point's structural changes to its components, grouped by how they changed,
// with values before and after: for persistence, replication and undo.
const save = Finalizer.changes({ name: "guide/changes/save", components: [name, score], resources: { read: [journal], write: [journal] } }, (changes, context) => {
    const lines = changes.groups.flatMap(group => group.entities.map(entity =>
        `${changes.previous(entity, name) ?? changes.next(entity, name)}: +${group.added.length} -${group.removed.length} score ${changes.previous(entity, score)} → ${changes.next(entity, score)}`));
    context[journal] = [...context[journal], ...lines];
});

const spawn = System.create({ name: "guide/changes/spawn" }, (_, __, commands) => { commands.spawn({ [name]: "ada", [score]: 3 }); });
const retire = System.create({ name: "guide/changes/retire", query: { has: [score] } }, (row, _, commands) => { commands.remove(row.entity, score); });

it("records each sync point's structural changes", async () => {
    await using world = await World.create({ systems: [spawn, retire, save] });
    await world.run(spawn);
    await world.run(retire);
    expect(world.read.resource(journal)).toEqual(["ada: +2 -0 score null → 3", "ada: +0 -1 score 3 → null"]);
});
