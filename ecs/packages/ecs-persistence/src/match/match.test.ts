// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Index, System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { decode } from "../decode.js";
import { encode } from "../encode.js";
import { snapshot, type Snapshot } from "../snapshot.js";
import { spawn } from "../spawn.js";

const material = Symbol();
const friction = Symbol();
const made = Symbol();
const label = Symbol();
const tag = Symbol();
const serial = Symbol();
const note = Symbol();
/** The trait these entities are saved by, its value each key's name. */
const saved = Symbol();
/** A trait of another place, which the snapshots here aren't taken by. */
const elsewhere = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [saved]: string;
        readonly [elsewhere]: string;
    }
    interface Components {
        [serial]: { type: number; [saved]: "serial" };
        [note]: { type: string; [saved]: "note" };
        [material]: { type: string; [saved]: "material" };
        [friction]: { type: number; [saved]: "friction" };
        [made]: { type: Entity; reference: "weak"; [saved]: "made" };
        [label]: { type: string; [saved]: "label" };
        [tag]: { type: string; [elsewhere]: "tag" };
    }
}

const materialByName = Index.create({ key: [material], unique: true, components: { with: [friction] } });
const materialByTag = Index.create({ key: [tag], unique: true });
const labelsByMaterial = Index.create({ key: [material] });
const taggedMaterials = Index.create({ key: [material], unique: true, components: { with: [tag] } });
const untaggedMaterials = Index.create({ key: [material], unique: true, components: { not: [tag] } });

const bySerial = Index.create({ key: [serial], unique: true });
const bySerialAndNote = Index.create({ key: [serial, note], unique: true });

const inline = () => World.create({ [workers]: 0 });

/** Spawns a part for each serial and note. */
const buildParts = System.create({}, ({ commands }, input: { readonly parts: readonly { readonly serial: number; readonly note: string }[] }) => {
    for (const part of input.parts) commands.spawn([serial, note])({ [serial]: part.serial, [note]: part.note });
});
/** Each part's serial and note, by serial. */
const partsOf = async (world: World): Promise<readonly { readonly entity: Entity; readonly serial: number; readonly note: string }[]> => {
    const found: { entity: Entity; serial: number; note: string }[] = [];
    await world.run(System.create({ readonly: true, components: { with: [serial, note] } }, row => {
        found.push({ entity: row.entity, serial: row[serial], note: row[note] });
    }));
    return found.sort((a, b) => a.serial - b.serial || a.note.localeCompare(b.note));
};

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
    const result = await snapshot({ world, by: saved });
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

    it("writes the snapshot's values onto the entities an index matches with update, through bytes too, leaving their other components", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }, { name: "wood", friction: 0.3 }], bodies: [{ label: "box", material: "steel" }] });
        await using into = inline();
        await into.run(build, { materials: [{ name: "steel", friction: 0.9 }], bodies: [] });
        const existingSteel = (await read(into)).find(item => item.material === "steel")?.entity ?? Entity.none;
        await into.run(System.create(({ commands }) => { commands.add(existingSteel, tag, "kept"); }));
        const decoded = decode(encode(await taken(from)), { by: saved });
        if (decoded.failure !== undefined) throw new Error(decoded.failure);
        const spawned = await spawn({ world: into, snapshot: decoded, match: [materialByName], update: true });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        expect(await described(into)).toEqual({ materials: { steel: 0.5, wood: 0.3 }, bodies: { box: "steel 0.5" } });
        const tags: string[] = [];
        await into.run(System.create({ readonly: true, components: { with: [tag] } }, row => { tags.push(row[tag]); }));
        expect([tags, (await read(into)).filter(item => item.material === "steel").map(item => item.entity)]).toEqual([["kept"], [existingSteel]]);
    });

    it("merges through bytes, as a snapshot encoded and decoded", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }], bodies: [{ label: "box", material: "steel" }] });
        await using into = inline();
        await into.run(build, { materials: [{ name: "steel", friction: 0.9 }], bodies: [] });
        const decoded = decode(encode(await taken(from)), { by: saved });
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

    it("fails for an index with a part of its key that the snapshot's trait doesn't cover, though another trait does", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }], bodies: [] });
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [materialByTag] });
        expect(spawned.failure).toBe(`Index "materialByTag" can't match: a part of its key isn't one the snapshot's trait covers, so the snapshot holds no key for it.`);
    });

    it("fails, spawning nothing, for an index whose with or not names a component the snapshot's trait doesn't cover", async () => {
        await using from = inline();
        await from.run(build, { materials: [{ name: "steel", friction: 0.5 }], bodies: [] });
        await using into = inline();
        for (const index of [taggedMaterials, untaggedMaterials]) {
            const spawned = await spawn({ world: into, snapshot: await taken(from), match: [index] });
            expect(spawned.failure).toBe(`Index "${index.name}" can't match: its with or not names a component the snapshot's trait doesn't cover, so the snapshot can't tell which of its entities the index holds.`);
        }
        expect(await read(into)).toEqual([]);
    });

    it("merges by a key of bytes, keeping the world's entities and spawning the rest", async () => {
        await using from = inline();
        // In an order other than the world's, so its rows are found by hash as well as by guess.
        await from.run(buildParts, { parts: Array.from({ length: 300 }, (_, k) => ({ serial: 1000 - k, note: "saved" })) });
        await using into = inline();
        await into.run(buildParts, { parts: Array.from({ length: 200 }, (_, k) => ({ serial: 701 + 2 * k, note: "world" })) });
        const before = new Map((await partsOf(into)).map(part => [part.serial, part.entity]));
        const saved = await partsOf(from);
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [bySerial] });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        const after = await partsOf(into);
        expect(after.length).toBe(200 + 150);
        for (const part of saved) {
            const entity = spawned.entities.get(part.entity);
            const existing = before.get(part.serial);
            if (existing !== undefined) expect(entity).toBe(existing);
            expect(after.find(item => item.entity === entity)?.note).toBe(existing === undefined ? "saved" : "world");
        }
    });

    it("fails, spawning nothing, for two of the snapshot's entities with one key of bytes", async () => {
        await using from = inline();
        await from.run(buildParts, { parts: [{ serial: 1, note: "a" }, { serial: 2, note: "b" }, { serial: 1, note: "c" }] });
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [bySerial] });
        expect(spawned.failure).toMatch(/two of the snapshot's entities have one key/);
        expect(await partsOf(into)).toEqual([]);
    });

    it("merges by a key of bytes and values together", async () => {
        await using from = inline();
        await from.run(buildParts, { parts: [{ serial: 1, note: "a" }, { serial: 1, note: "b" }, { serial: 2, note: "a" }] });
        await using into = inline();
        await into.run(buildParts, { parts: [{ serial: 1, note: "b" }] });
        const existing = (await partsOf(into))[0]?.entity;
        const spawned = await spawn({ world: into, snapshot: await taken(from), match: [bySerialAndNote] });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        expect((await partsOf(into)).map(part => [part.serial, part.note])).toEqual([[1, "a"], [1, "b"], [2, "a"]]);
        const savedB = (await partsOf(from)).find(part => part.note === "b")?.entity ?? Entity.none;
        expect(spawned.entities.get(savedB)).toBe(existing);
    });

    it("takes only unique indexes", () => {
        // @ts-expect-error: an index that isn't unique can hold two entities with one key, so it can't say which is the same.
        const notUnique: Parameters<typeof spawn>[0]["match"] = [labelsByMaterial];
        expect(notUnique?.length).toBe(1);
    });
});
