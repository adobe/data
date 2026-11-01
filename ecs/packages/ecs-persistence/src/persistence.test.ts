// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Rule, System, World, workers, type Schema, type Vec3 } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { decode } from "./decode.js";
import { encode } from "./encode.js";
import { snapshot, type Snapshot } from "./snapshot.js";
import { spawn } from "./spawn.js";

/** Saved in a document, under its name. */
const document = Symbol();
/** Saved in the user's settings, under its name. */
const settings = Symbol();
/** Traits that can't be saved by: one whose value isn't a name, one on a derived component, one naming two alike. */
const counted = Symbol();
const derivedOnly = Symbol();
const clashing = Symbol();
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
const tool = Symbol();
const zoom = Symbol();
const glow = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [document]: string;
        readonly [settings]: string;
        readonly [counted]: number;
        readonly [derivedOnly]: string;
        readonly [clashing]: string;
    }
    interface Components {
        [position]: { type: Vec3; [document]: "position"; [counted]: 1 };
        [health]: { type: number; [document]: "health"; [clashing]: "vitals" };
        [level]: { type: Schema.Type<{ type: "integer"; minimum: 0; maximum: 99 }>; [document]: "level" };
        [alive]: { type: boolean; [document]: "alive" };
        [color]: { type: { readonly r: number; readonly g: number; readonly b: number }; [document]: "color" };
        [name]: { type: string; [document]: "name" };
        [tags]: { type: readonly string[]; [document]: "tags" };
        [inventory]: { type: ReadonlyMap<string, number>; [document]: "inventory" };
        [seen]: { type: ReadonlySet<string>; [document]: "seen" };
        [team]: { type: "red" | "blue"; shared: true; [document]: "team" };
        [parent]: { type: Entity; reference: "owner"; [document]: "parent" };
        [target]: { type: Entity; reference: "weak"; [document]: "target" };
        [link]: { type: { readonly to: Entity; readonly weight: number }; [document]: "link" };
        [friends]: { type: readonly Entity[]; [document]: "friends" };
        [scratch]: { type: number; [clashing]: "vitals" };
        [glow]: { type: number; derived: true; [derivedOnly]: "glow" };
    }
    interface Resources {
        [score]: { type: number; default: 0; [document]: "score" };
        [motto]: { type: string; default: ""; [document]: "motto" };
        [unsaved]: { type: number; default: 0 };
        // The user's own, never in a document; the zoom also in the document, under another name.
        [tool]: { type: string; default: "select"; [settings]: "tool" };
        [zoom]: { type: number; default: 1; [settings]: "zoom"; [document]: "view zoom" };
    }
}

Rule.create({ components: { with: [health] }, derive: [glow] });

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
    const result = decode(bytes, { by: document });
    if ("failure" in result) throw new Error(result.failure);
    return result;
};

describe("persistence", () => {
    it("saves and loads every kind of value and the resources its trait covers, each entity value naming the entity loaded for it, cycles and self references included", async () => {
        await using from = World.create({ [workers]: 0, [score]: 12, [motto]: "onward", [unsaved]: 3 });
        await from.run(scene);
        const before = named(await read(from));
        const bytes = encode(await taken({ world: from, by: document }));
        const loaded = decoded(bytes);
        await using into = inline();
        const spawned = await spawn({ world: into, snapshot: loaded });
        expect("failure" in spawned).toBe(false);
        const after = named(await read(into));
        // What the trait doesn't cover, a component without it, isn't loaded.
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
        const copied = await spawn({ world: into, snapshot: await taken({ world: from, by: document, resources: false }) });
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
        const subtree = await taken({ world, by: document, root });
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
        const all = await taken({ world, by: document, resources: false });
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
        const subtree = await taken({ world, by: document, root: child });
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
        const pointers = await taken({ world, by: document, with: [target] });
        await using other = inline();
        const spawned = await spawn({ world: other, snapshot: decoded(encode(pointers)) });
        expect("failure" in spawned).toBe(false);
        expect(named(await read(other))).toEqual({ pointer: expect.objectContaining({ team: "blue", target: undefined }) });
    });

    it("refuses bytes that aren't a snapshot, a component the trait doesn't cover, and one with another schema", async () => {
        await using world = inline();
        await world.run(scene);
        const bytes = encode(await taken({ world, by: document }));
        expect(decode(new Uint8Array(32), { by: document })).toEqual({ failure: "These bytes aren't a snapshot." });
        // A character a byte, so the header's text is edited in place and the blocks after it are kept as they are.
        const text = new TextDecoder("latin1").decode(bytes);
        const edited = (from: string, to: string): Uint8Array => {
            // Edits of the same length keep every offset in place.
            expect(to.length).toBe(from.length);
            const at = text.indexOf(from);
            expect(at).toBeGreaterThan(0);
            const copy = bytes.slice();
            copy.set(new TextEncoder().encode(to), at);
            return copy;
        };
        expect(decode(edited(`"name":"health"`, `"name":"hea1th"`), { by: document })).toEqual({ failure: `This snapshot holds component "hea1th", which the trait doesn't cover.` });
        expect(decode(edited(`"maximum":99`, `"maximum":98`), { by: document })).toEqual({ failure: `Component "level" has another schema here than in this snapshot.` });
        expect(decode(bytes.subarray(0, bytes.byteLength - 8), { by: document })).toEqual({ failure: "This snapshot's blocks are cut short." });
    });

    it("loads bytes given at an offset that isn't a multiple of 8", async () => {
        await using world = inline();
        await world.run(scene);
        const bytes = encode(await taken({ world, by: document }));
        const shifted = new Uint8Array(bytes.byteLength + 3);
        shifted.set(bytes, 3);
        await using other = inline();
        expect("failure" in await spawn({ world: other, snapshot: decoded(shifted.subarray(3)) })).toBe(false);
        expect((await read(other)).length).toBe((await read(world)).length);
    });

    it("keeps what each trait covers apart: a key under each of its traits, by the name each gives it, and bytes of one refused as the other", async () => {
        await using world = World.create({ [workers]: 0, [tool]: "brush", [zoom]: 2 });
        await world.run(scene);
        const preferences = await taken({ world, by: settings });
        const saved = await taken({ world, by: document });
        await using other = World.create({ [workers]: 0 });
        const loaded = decode(encode(preferences), { by: settings });
        if (loaded.failure !== undefined) throw new Error(loaded.failure);
        expect((await spawn({ world: other, snapshot: loaded })).failure).toBeUndefined();
        const readSettings = System.create({ readonly: true }, ({ resources }) => [resources[tool], resources[zoom], resources[score]]);
        // Settings hold resources alone, and spawn none of the scene's entities.
        expect([await other.run(readSettings), (await read(other)).length]).toEqual([["brush", 2, 0], 0]);
        expect(decode(encode(preferences), { by: document })).toEqual({ failure: `This snapshot holds resource "tool", which the trait doesn't cover.` });
        expect(decode(encode(saved), { by: settings })).toEqual({ failure: `This snapshot holds component "position", which the trait doesn't cover.` });
        await using third = inline();
        expect((await spawn({ world: third, snapshot: decoded(encode(saved)) })).failure).toBeUndefined();
        // The document holds the zoom under its own name, and no tool.
        expect(await third.run(readSettings)).toEqual(["select", 2, 0]);
        expect((await read(third)).length).toBe((await read(world)).length);
    });

    it("fails, as data, for a trait it can't save by", async () => {
        await using world = inline();
        await world.run(scene);
        /** A snapshot by `by`, untyped, as JavaScript calls it. */
        const failure = async (by: unknown): Promise<string | undefined> => {
            const result: Awaited<ReturnType<typeof snapshot>> = await Reflect.apply(snapshot, undefined, [{ world, by }]);
            return result.failure;
        };
        expect(await failure("document")).toBe("`by` is the key of the trait to save by, a symbol.");
        expect(await failure(counted)).toBe("A component's value of the trait isn't a name: 1.");
        expect(await failure(derivedOnly)).toBe(`The component the trait names "glow" is derived, which its rule derives again once its entity is loaded.`);
        expect(await failure(clashing)).toBe(`The trait names two components "vitals".`);
        expect(decode(encode(await taken({ world, by: document })), { by: clashing })).toEqual({ failure: `The trait names two components "vitals".` });
        // Types only: the trait's value is a name, the trait an application's own, and decode takes it too.
        const _typed = (): void => {
            // @ts-expect-error a trait whose value names a key
            void snapshot({ world, by: counted });
            // @ts-expect-error a trait of the application's own, by its key
            void snapshot({ world, by: "shared" });
            // @ts-expect-error decode takes the trait too
            void decode(new Uint8Array(0));
        };
    });
});
