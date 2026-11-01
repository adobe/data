// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Index, System, World, type Vec2 } from "@adobe/ecs";
import { decode, encode, snapshot, spawn } from "../index.js";

/** Saved in a file, under its name there. */
const file = Symbol();
const chunk = Symbol();
const tree = Symbol();

declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [file]: string;
    }
    interface Components {
        // Shared: each chunk's entities are an archetype of their own, holding its coordinates once.
        [chunk]: { type: Vec2.I32; shared: true; [file]: "chunk" };
        [tree]: { type: number; [file]: "tree" };
    }
}

/** Trees are numbered across the map, so one with a number is the same tree in every world. */
const byTree = Index.create({ key: [tree], unique: true });

/** Three trees in each of four chunks, `x` 0 to 3. */
const grow = System.create(({ commands }) => {
    for (let x = 0; x < 4; x++) {
        const plant = commands.spawn([chunk, tree], { [chunk]: [x, 0] });
        for (let k = 0; k < 3; k++) plant({ [tree]: 10 * x + k });
    }
});

/** Unloads chunk `x`: despawns the trees of the archetype holding its coordinates, by one command. */
const unload = System.create({}, ({ commands }, input: { readonly x: number }) => {
    commands.despawnWhere({ with: [tree], where: { [chunk]: [input.x, 0] } });
});

/** Cuts the trees of chunk 2 down: those from `from` on. */
const cut = System.create({ components: { with: [chunk, tree] } }, (row, { commands }, input: { readonly from: number }) => {
    if (row[chunk][0] === 2 && row[tree] % 10 >= input.from) commands.despawn(row.entity);
});

const trees: string[] = [];
const survey = System.create({ readonly: true, components: { with: [chunk, tree] } }, row => {
    trees.push(`${row[chunk][0]}:${row[tree]}`);
});
const surveyed = async (world: World): Promise<string> => {
    trees.length = 0;
    await world.run(survey);
    return [...trees].sort().join(" ");
};

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(grow);

    // Chunk 2 alone: only the archetype holding its coordinates is read.
    const saved = await snapshot({ world, by: file, where: { [chunk]: [2, 0] }, resources: false });
    if (saved.failure !== undefined) return console.log(saved.failure);
    const bytes = encode(saved);

    // Unloaded, then loaded back from its bytes, into the archetype of its coordinates.
    await world.run(unload, { x: 2 });
    console.log("unloaded", await surveyed(world));
    const read = decode(bytes, { by: file });
    if (read.failure !== undefined) return console.log(read.failure);
    const loaded = await spawn({ world, snapshot: read });
    if (loaded.failure !== undefined) return console.log(loaded.failure);
    console.log("loaded  ", await surveyed(world));

    // One tree cut since: loaded again with match, the two standing keep their entities and only the cut one returns.
    await world.run(cut, { from: 2 });
    const merged = await spawn({ world, snapshot: read, match: [byTree] });
    if (merged.failure !== undefined) return console.log(merged.failure);
    console.log("merged  ", await surveyed(world));
};
