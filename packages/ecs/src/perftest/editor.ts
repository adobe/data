// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import { Entity } from "../interface/entity/entity.js";
import { Index } from "../interface/indexes/index-type.js";
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";

// A 2D editor loading a document: a tree of groups and leaves, a sorted paint-order index, a hash index of children
// by parent, and `up` systems with change filters propagating transforms and opacity down the tree.

const localX = Symbol("editor/localX");
const localY = Symbol("editor/localY");
const worldX = Symbol("editor/worldX");
const worldY = Symbol("editor/worldY");
const opacity = Symbol("editor/opacity");
const worldOpacity = Symbol("editor/worldOpacity");
const paintDepth = Symbol("editor/paintDepth");
const parent = Symbol("editor/parent");
const group = Symbol("editor/group");
const shape = Symbol("editor/shape");
const image = Symbol("editor/image");
declare module "@adobe/ecs" {
    export interface Components {
        [localX]: { type: number };
        [localY]: { type: number };
        [worldX]: { type: number };
        [worldY]: { type: number };
        [opacity]: { type: number };
        [worldOpacity]: { type: number };
        [paintDepth]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [group]: { type: true };
        [shape]: { type: true };
        [image]: { type: true };
    }
}

const node = [localX, localY, worldX, worldY, opacity, worldOpacity, paintDepth] as const;
const Document = Archetype.create([...node, group]);
const Group = Archetype.create([...node, parent, group]);
const Shape = Archetype.create([...node, parent, shape]);
const Image = Archetype.create([...node, parent, image]);

const byPaintDepth = Index.create({ name: "editor/byPaintDepth", key: [paintDepth], sorted: true });
const childrenOf = Index.create({ name: "editor/childrenOf", key: [parent] });

/** Groups under the document, subgroups in each, and leaves in each subgroup: 50,201 nodes. */
const groups = 200;
const subgroups = 2;
const leaves = 124;
const nodes = 1 + groups * (1 + subgroups * (1 + leaves));

/** Spawns the document depth first, as a file lists it, its paint depth its place in that order. */
const load = System.create({ name: "editor/load" }, ({ commands }) => {
    let depth = 0;
    const values = (x: number) => ({ [localX]: x, [localY]: 1, [worldX]: 0, [worldY]: 0, [opacity]: 0.99, [worldOpacity]: 1, [paintDepth]: depth++ });
    const document = commands.spawn(Document)(values(0));
    for (let g = 0; g < groups; g++) {
        const outer = commands.spawn(Group)({ ...values(g), [parent]: document, [group]: true });
        for (let s = 0; s < subgroups; s++) {
            const inner = commands.spawn(Group)({ ...values(s), [parent]: outer, [group]: true });
            for (let l = 0; l < leaves; l++) {
                if (l % 2 === 0) commands.spawn(Shape)({ ...values(l), [parent]: inner, [shape]: true });
                else commands.spawn(Image)({ ...values(l), [parent]: inner, [image]: true });
            }
        }
    }
});

/** Each node's world position is its parent's plus its own. */
const place = System.create({
    name: "editor/place",
    components: { read: [localX, localY], write: [worldX, worldY], changed: [localX, localY] },
    up: { through: parent, read: [worldX, worldY] },
}, (row, { up }) => {
    row[worldX] = (up === null ? 0 : up[worldX]) + row[localX];
    row[worldY] = (up === null ? 0 : up[worldY]) + row[localY];
});
/** Each node's world opacity is its parent's times its own. */
const fade = System.create({
    name: "editor/fade",
    components: { read: [opacity], write: [worldOpacity], changed: [opacity] },
    up: { through: parent, read: [worldOpacity] },
}, (row, { up }) => {
    row[worldOpacity] = (up === null ? 1 : up[worldOpacity]) * row[opacity];
});
let checksum = 0;
/** Each group counts its children, as a layout does. */
const layout = System.create({ name: "editor/layout", components: { has: [group] }, lookup: { children: { index: childrenOf } } }, (row, { lookup }) => {
    checksum += lookup.children(row.entity).length;
});
/** Visits every node in paint order, as drawing does. */
const paint = System.create({ name: "editor/paint", components: { read: [worldX, worldOpacity] }, order: byPaintDepth, after: [place, fade] }, row => {
    checksum = (checksum * 31 + row[worldX] * row[worldOpacity]) % 1000003;
});
const frame = System.create({ name: "editor/frame", systems: [place, fade, layout, paint] });

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

export const editorBenchmarks: readonly Benchmark[] = [{
    name: "editor load tick 50K",
    operation: "A 2D editor's first tick after loading a 50K-node document of groups and leaves: two `up` systems with change filters propagate transforms and opacity down the tree, a layout looks up children through a hash index on the parent, and painting runs in a sorted index's order, so every `up` order and index is built from scratch.",
    per: "nodes",
    n: nodes,
    typical: [1_000, 100_000],
    best: { bytes: 100, basis: "Each node reads its parent link, its 7 values and its parent's 3, writes 3, and enters two indexes and two orders." },
    run: async () => {
        let best = Infinity;
        for (let i = 0; i < 8; i++) {
            const world = createWorld({ [workers]: 0 });
            await world.run(frame);
            await world.run(load);
            checksum = 0;
            const start = performance.now();
            await world.run(frame);
            best = Math.min(best, performance.now() - start);
            check(checksum !== 0, "editor load tick: nothing ran");
            await world.dispose();
        }
        return best;
    },
}];

