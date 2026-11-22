// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { type Entity, Index, System, World, workers } from "../../index.js";

const holder = Symbol();
const cell = Symbol();
const kind = Symbol();
const face = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [holder]: { type: Entity; reference: "owner" };
        [cell]: { type: number };
        [kind]: { type: true };
        [face]: { type: true };
    }
}

// Each index lists its key in its `with` too.
const Cell = [kind, cell, holder] as const;
const Face = [face, holder, cell] as const;
const cells = Index.create({ key: [holder], sorted: true, components: { with: [...Cell] } });
const faces = Index.create({ key: [holder], sorted: true, components: { with: [...Face] } });

const spawn = System.create(({ commands }) => {
    const a = commands.spawn([kind, cell])({ [kind]: true, [cell]: 0 });
    commands.spawn(Cell)({ [kind]: true, [cell]: 1, [holder]: a });
    commands.spawn(Face)({ [face]: true, [cell]: 2, [holder]: a });
});

const read = System.create({ lookup: { cells: { index: cells }, faces: { index: faces } } }, ({ lookup }) => {
    const shown = lookup.cells();
    const listed = lookup.faces();
    // Rows read through a helper, which the build doesn't follow, so the lookup reads everything its index holds.
    const rows = (list: typeof shown) => ({ length: list.length, at: (i: number) => { const row = list.at(i); return { at: row[cell], of: row[holder] }; } });
    return [rows(shown).at(0), { at: listed.at(0)[cell], of: listed.at(0)[holder] }];
});

it("reads the rows of an index whose `with` lists its key too, where the build didn't follow what the body reads", async () => {
    await using world = World.create({ [workers]: 0 });
    await world.run(spawn);
    const [kept, listed] = await world.run(read);
    expect(kept?.at).toBe(1);
    expect(listed?.at).toBe(2);
    expect(kept?.of).toBe(listed?.of);
});
