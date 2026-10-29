// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World, workers, type Schema, type Vec3 } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { decode } from "./decode.js";
import { encode } from "./encode.js";
import { persist } from "./persist.js";
import { snapshot, type Snapshot } from "./snapshot.js";
import { spawn } from "./spawn.js";

const position = Symbol();
const health = Symbol();
const level = Symbol();
const alive = Symbol();
const color = Symbol();
const name = Symbol();
const tags = Symbol();
const inventory = Symbol();
const seen = Symbol();
const team = Symbol();
const parent = Symbol();
const target = Symbol();
const link = Symbol();
const friends = Symbol();
const scratch = Symbol();
const score = Symbol();
const motto = Symbol();
const unsaved = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3; [persist]: "position" };
        [health]: { type: number; [persist]: "health" };
        [level]: { type: Schema.Type<{ type: "integer"; minimum: 0; maximum: 99 }>; [persist]: "level" };
        [alive]: { type: boolean; [persist]: "alive" };
        [color]: { type: { readonly r: number; readonly g: number; readonly b: number }; [persist]: "color" };
        [name]: { type: string; [persist]: "name" };
        [tags]: { type: readonly string[]; [persist]: "tags" };
        [inventory]: { type: ReadonlyMap<string, number>; [persist]: "inventory" };
        [seen]: { type: ReadonlySet<string>; [persist]: "seen" };
        [team]: { type: "red" | "blue"; shared: true; [persist]: "team" };
        [parent]: { type: Entity; reference: "owner"; [persist]: "parent" };
        [target]: { type: Entity; reference: "weak"; [persist]: "target" };
        [link]: { type: { readonly to: Entity; readonly weight: number }; [persist]: "link" };
        [friends]: { type: readonly Entity[]; [persist]: "friends" };
        [scratch]: { type: number };
    }
    interface Resources {
        [score]: { type: number; default: 0; [persist]: "score" };
        [motto]: { type: string; default: ""; [persist]: "motto" };
        [unsaved]: { type: number; default: 0 };
    }
}

const inline = () => World.create({ [workers]: 0 });

type Seen = {
    readonly name: string;
    readonly entity: Entity;
    readonly values: { readonly [key: string]: unknown };
};

const rows: Seen[] = [];
const readAll = System.create({ readonly: true, components: { with: [name], optional: [position, health, level, alive, color, tags, inventory, seen, team, parent, target, link, friends, scratch] } }, row => {
    rows.push({
        name: row[name], entity: row.entity,
        values: {
            position: row[position], health: row[health], level: row[level], alive: row[alive], color: row[color], tags: row[tags], inventory: row[inventory],
            seen: row[seen], team: row[team], parent: row[parent], target: row[target], link: row[link], friends: row[friends], scratch: row[scratch],
        },
    });
});
const read = async (world: World): Promise<readonly Seen[]> => {
    rows.length = 0;
    await world.run(readAll);
    return [...rows].sort((a, b) => a.name.localeCompare(b.name));
};

/** Each entity's values with its entity values given as the names of the entities they name. */
const named = (seen: readonly Seen[]): { readonly [name: string]: unknown } => {
    const names = new Map<number, string>(seen.map(entry => [entry.entity, entry.name]));
    const nameOf = (entity: unknown): unknown => typeof entity === "number" ? entity === Entity.none ? "none" : names.get(entity) ?? `outside ${entity}` : entity;
    return Object.fromEntries(seen.map(entry => [entry.name, {
        ...entry.values,
        parent: nameOf(entry.values["parent"]), target: nameOf(entry.values["target"]),
        link: entry.values["link"] === undefined ? undefined : { ...Object(entry.values["link"]), to: nameOf(Reflect.get(Object(entry.values["link"]), "to")) },
        friends: Array.isArray(entry.values["friends"]) ? entry.values["friends"].map(nameOf) : undefined,
    }]));
};

const scene = System.create(({ commands }) => {
    const root = commands.spawn([name, position, health, level, alive, color])({ [name]: "root", [position]: [1, 2, 3], [health]: 0.5, [level]: 7, [alive]: true, [color]: { r: 1, g: 0.5, b: 0 } });
    const child = commands.spawn([name, parent, tags, inventory, seen])({ [name]: "child", [parent]: root, [tags]: ["a", "b"], [inventory]: new Map([["gold", 3]]), [seen]: new Set(["x"]) });
    commands.spawn([name, parent, friends])({ [name]: "grandchild", [parent]: child, [friends]: [root, child] });
    commands.spawn([name, team, target], { [team]: "blue" })({ [name]: "pointer", [target]: child });
    const loop = commands.spawn([name, link])({ [name]: "loop", [link]: { to: Entity.none, weight: 2 } });
    commands.add(loop, link, { to: loop, weight: 2 });
    commands.spawn([name, scratch])({ [name]: "scratched", [scratch]: 9 });
});

const taken = async (input: Parameters<typeof snapshot>[0]): Promise<Snapshot> => {
    const result = await snapshot(input);
    if (result.failure !== undefined) throw new Error(result.failure);
    return result;
};

const decoded = (bytes: Uint8Array): Snapshot => {
    const result = decode(bytes);
    if ("failure" in result) throw new Error(result.failure);
    return result;
};

describe("persistence", () => {
    it("saves and loads every kind of value and the persisted resources, each entity value naming the entity loaded for it, cycles and self references included", async () => {
        await using from = World.create({ [workers]: 0, [score]: 12, [motto]: "onward", [unsaved]: 3 });
        await from.run(scene);
        const before = named(await read(from));
        const bytes = encode(await taken({ world: from }));
        const loaded = decoded(bytes);
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: loaded });
        expect("failure" in spawned).toBe(false);
        const after = named(await read(into));
        // What isn't persisted, an unpersisted component, isn't loaded.
        expect(after).toEqual({ ...before, scratched: { ...Object(before["scratched"]), scratch: undefined } });
        const resources = await into.run(System.create({ readonly: true }, ({ resources }) => [resources[score], resources[motto], resources[unsaved]]));
        expect(resources).toEqual([12, "onward", 0]);
    });

    it("merges into a world holding entities, its entities new ones", async () => {
        await using from = inline();
        await from.run(scene);
        await using into = inline();
        await into.run(scene);
        const there = await read(into);
        const copied = await spawn({ world: into, snapshot: await taken({ world: from, resources: false }) });
        expect("failure" in copied).toBe(false);
        const all = await read(into);
        expect(all.length).toBe(there.length * 2);
        const roots = all.filter(entry => entry.name === "root").map(entry => entry.entity);
        expect(new Set(roots).size).toBe(2);
        const children = all.filter(entry => entry.name === "child");
        expect(children.map(entry => entry.values["parent"]).sort()).toEqual([...roots].sort());
    });

    it("takes an owner subtree, every entity it owns through others included", async () => {
        await using world = inline();
        await world.run(scene);
        const before = await read(world);
        const root = before.find(entry => entry.name === "root")?.entity ?? Entity.none;
        const subtree = await taken({ world, root });
        await using other = inline();
        const spawned = await spawn({ world: other, snapshot: subtree });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        expect(spawned.entities.size).toBe(3);
        expect(spawned.dropped).toBe(0);
        const spawnedRoot = spawned.entities.get(root);
        expect(named(await read(other))).toMatchObject({ root: {} });
        expect((await read(other)).find(entry => entry.name === "root")?.entity).toBe(spawnedRoot);
        expect(named(await read(other))).toMatchObject({ child: { parent: "root" }, grandchild: { parent: "child", friends: ["root", "child"] } });
    });

    it("leaves the map of entities out of what it spawned when asked to, and spawns the same", async () => {
        await using world = inline();
        await world.run(scene);
        const all = await taken({ world, resources: false });
        await using other = inline();
        const spawned = await spawn({ world: other, snapshot: all, entities: false });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        expect(spawned).toEqual({ dropped: 0 });
        expect((await read(other)).length).toBe((await read(world)).length);
    });

    it("spawns nothing owned, directly or through others, by an entity outside the snapshot, saying how many", async () => {
        await using world = inline();
        await world.run(scene);
        const child = (await read(world)).find(entry => entry.name === "child")?.entity ?? Entity.none;
        // The child's owner, the root, isn't in its subtree.
        const subtree = await taken({ world, root: child });
        await using other = inline();
        const spawned = await spawn({ world: other, snapshot: subtree });
        if (spawned.failure !== undefined) throw new Error(spawned.failure);
        expect(spawned.dropped).toBe(2);
        expect(spawned.entities.get(child)).toBeNull();
        expect(await read(other)).toEqual([]);
    });

    it("takes the entities a query matches, each loaded without a weak reference to an entity outside them", async () => {
        await using world = inline();
        await world.run(scene);
        const pointers = await taken({ world, with: [target] });
        await using other = inline();
        const spawned = await spawn({ world: other, snapshot: decoded(encode(pointers)) });
        expect("failure" in spawned).toBe(false);
        expect(named(await read(other))).toEqual({ pointer: expect.objectContaining({ team: "blue", target: undefined }) });
    });

    it("refuses bytes that aren't a snapshot, a component this program doesn't persist, and one with another schema", async () => {
        await using world = inline();
        await world.run(scene);
        const bytes = encode(await taken({ world }));
        expect(decode(new Uint8Array(32))).toEqual({ failure: "These bytes aren't a snapshot." });
        const text = new TextDecoder().decode(bytes);
        const edited = (from: string, to: string): Uint8Array => {
            // Edits of the same length keep every offset in place.
            expect(to.length).toBe(from.length);
            return new TextEncoder().encode(text.replace(from, to));
        };
        expect(decode(edited(`"name":"health"`, `"name":"hea1th"`))).toEqual({ failure: `This snapshot holds component "hea1th", which this program doesn't persist.` });
        expect(decode(edited(`"maximum":99`, `"maximum":98`))).toEqual({ failure: `Component "level" has another schema here than in this snapshot.` });
        expect(decode(bytes.subarray(0, bytes.byteLength - 8))).toEqual({ failure: "This snapshot's blocks are cut short." });
    });

    it("loads bytes given at an offset that isn't a multiple of 8", async () => {
        await using world = inline();
        await world.run(scene);
        const bytes = encode(await taken({ world }));
        const shifted = new Uint8Array(bytes.byteLength + 3);
        shifted.set(bytes, 3);
        await using other = inline();
        expect("failure" in await spawn({ world: other, snapshot: decoded(shifted.subarray(3)) })).toBe(false);
        expect((await read(other)).length).toBe((await read(world)).length);
    });
});
