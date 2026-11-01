// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Index, System, World } from "@adobe/ecs";
import { persist, snapshot, spawn } from "../index.js";

const label = Symbol();
const parent = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [label]: { type: string; [persist]: "label" };
        [parent]: { type: Entity; reference: "owner"; [persist]: "parent" };
    }
}

/** Labels are unique here, so an entity with one is the same in every world. */
const byLabel = Index.create({ key: [label], unique: true });

let ship = Entity.none;
let hull = Entity.none;

const build = System.create(({ commands }) => {
    ship = commands.spawn([label])({ [label]: "ship" });
    hull = commands.spawn([label, parent])({ [label]: "hull", [parent]: ship });
    commands.spawn([label, parent])({ [label]: "mast", [parent]: hull });
    commands.spawn([label])({ [label]: "island" });
});

const labels: string[] = [];
let shipFound = Entity.none;
const list = System.create({ readonly: true, components: { with: [label], optional: [parent] } }, row => {
    labels.push(row[parent] === undefined ? row[label] : `${row[label]}, owned`);
    if (row[label] === "ship") shipFound = row.entity;
});
const listed = async (world: World): Promise<readonly string[]> => {
    labels.length = 0;
    await world.run(list);
    return [...labels].sort();
};

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(build);

    // The ship and everything it owns, through persisted owner references, copied into another world.
    await using harbor = World.create();
    const fleet = await snapshot({ world, root: ship });
    if (fleet.failure !== undefined) return console.log(fleet.failure);
    const copied = await spawn({ world: harbor, snapshot: fleet });
    if (copied.failure !== undefined) return console.log(copied.failure);
    console.log("harbor holds", await listed(harbor));
    console.log("entities gives the harbor's ship for the ship:", copied.entities.get(ship) === shipFound);

    // The fleet again, matched by label: the harbor's own stand for its entities, so none is copied twice.
    const merged = await spawn({ world: harbor, snapshot: fleet, match: [byLabel] });
    if (merged.failure !== undefined) return console.log(merged.failure);
    console.log("harbor holds, merged", await listed(harbor));

    // The hull's subtree, its owner left behind: copied, the hull would belong to no one, so neither it nor its mast is.
    await using dock = World.create();
    const hullOnly = await snapshot({ world, root: hull });
    if (hullOnly.failure !== undefined) return console.log(hullOnly.failure);
    const docked = await spawn({ world: dock, snapshot: hullOnly, entities: false });
    if (docked.failure !== undefined) return console.log(docked.failure);
    console.log("dock holds", await listed(dock), "and dropped", docked.dropped);
};
