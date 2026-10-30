// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Index, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { decode } from "../decode.js";
import { encode } from "../encode.js";
import { persist } from "../persist.js";
import { snapshot, type Snapshot } from "../snapshot.js";
import { spawn } from "../spawn.js";

const material = Symbol();
const friction = Symbol();
const made = Symbol();
const label = Symbol();
const tag = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [material]: { type: string; [persist]: "matchTest/material" };
        [friction]: { type: number; [persist]: "matchTest/friction" };
        [made]: { type: Entity; reference: "weak"; [persist]: "matchTest/made" };
        [label]: { type: string; [persist]: "matchTest/label" };
        [tag]: { type: string };
    }
}

const materialByName = Index.create({ key: [material], unique: true, components: { with: [friction] } });
const materialByTag = Index.create({ key: [tag], unique: true });
const labelsByMaterial = Index.create({ key: [material] });

const inline = () => World.create({ [workers]: 0 });

/** Spawns materials, each its name and friction, and bodies, each its label and the material it's made of. */
type Built = {
    readonly materials: readonly { readonly name: string; readonly friction: number }[];
    readonly bodies: readonly { readonly label: string; readonly material: string }[];
};
const build = System.create({}, ({ commands }, input: Built) => {
    const byName = new Map<string, Entity>();
    for (const item of input.materials) byName.set(item.name, commands.spawn([material, friction])({ [material]: item.name, [friction]: item.friction }));
    for (const item of input.bodies) commands.spawn([label, made])({ [label]: item.label, [made]: byName.get(item.material) ?? Entity.none });
});

type Seen = { readonly entity: Entity; readonly material?: string; readonly friction?: number; readonly label?: string; readonly made?: Entity };
const seen: Seen[] = [];
const look = System.create({ readonly: true, components: { optional: [material, friction, label, made] } }, row => {
    if (row[material] === undefined && row[label] === undefined) return;
    seen.push({ entity: row.entity, material: row[material], friction: row[friction], label: row[label], made: row[made] });
});
const read = async (world: World): Promise<readonly Seen[]> => {
    seen.length = 0;
    await world.run(look);
    return [...seen];
};
/** Each body's label to its material's name and friction, and each material's name to its friction. */
const described = async (world: World): Promise<{ readonly bodies: { readonly [label: string]: string }; readonly materials: { readonly [name: string]: number } }> => {
    const all = await read(world);
    const bodies: { [label: string]: string } = {};
    const materials: { [name: string]: number } = {};
    for (const item of all) {
        if (item.material !== undefined) materials[item.material] = item.friction ?? -1;
        if (item.label !== undefined) {
            const of = all.find(other => other.entity === item.made);
            bodies[item.label] = `${of?.material ?? "none"} ${of?.friction ?? -1}`;
        }
    }
    return { bodies, materials };
};

const taken = async (world: World): Promise<Snapshot> => {
    const result = await snapshot({ world });
    if (result.failure !== undefined) throw new Error(result.failure);
    return result;
};

describe("spawn with match", () => {
    it("merges the snapshot's entities an index matches into the world's, keeping the world's values, its bodies naming them", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }, { name: "wood", friction: 0.3 }], bodies: [{ label: "box", material: "steel" }, { label: "crate", material: "wood" }] });
        await using into = inline();
        await into.run(build, { materials: [{ name: "steel", friction: 0.9 }], bodies: [] });
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [materialByName] });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        // Steel is merged, the world's friction kept; wood, which the world doesn't hold, is spawned.
        expect(await described(into)).toEqual({ materials: { steel: 0.9, wood: 0.3 }, bodies: { box: "steel 0.9", crate: "wood 0.3" } });
        const existingSteel = (await read(into)).find(item => item.material === "steel")?.entity;
        const savedSteel = (await read(from)).find(item => item.material === "steel")?.entity ?? Entity.none;
        expect(spawned.entities.get(savedSteel)).toBe(existingSteel);
    });

    it("merges through bytes, as a snapshot encoded and decoded", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }], bodies: [{ label: "box", material: "steel" }] });
        await using into = inline();
        await into.run(build, { materials: [{ name: "steel", friction: 0.9 }], bodies: [] });
        const decoded = decode(encode(await taken(from)));
        if (decoded.failure !== undefined) throw new Error(decoded.failure);
        const spawned = await spawn({ world: into, snapshot: decoded, match: [materialByName] });
        expect(spawned.failure).toBeUndefined();
        expect(await described(into)).toEqual({ materials: { steel: 0.9 }, bodies: { box: "steel 0.9" } });
    });

    it("fails, spawning nothing, for two of the snapshot's entities one index holds with one key", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "iron", friction: 0.4 }, { name: "iron", friction: 0.6 }], bodies: [] });
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [materialByName] });
        expect(spawned.failure).toMatch(/two of the snapshot's entities have one key/);
        expect(await read(into)).toEqual([]);
    });

    it("fails for an index with a part of its key that isn't persisted", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }], bodies: [] });
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [materialByTag] });
        expect(spawned.failure).toMatch(/a part of its key isn't persisted/);
    });

    it("takes only unique indexes", () => {
        // @ts-expect-error: an index that isn't unique can hold two entities with one key, so it can't say which is the same.
        const notUnique: Parameters<typeof spawn>[0]["match"] = [labelsByMaterial];
        expect(notUnique?.length).toBe(1);
    });
});
