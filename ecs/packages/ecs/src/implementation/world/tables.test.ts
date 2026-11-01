// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { clock, Component, Entity, Resource, System, workers } from "../../index.js";
import type { Vec3 } from "../../interface/math/index.js";
import type { Tables } from "../../interface/system/tables.js";
import type { Table } from "../../interface/world/table/table.js";
import { createWorld } from "./create.js";

const position = Symbol("tablesTest/position");
const label = Symbol("tablesTest/label");
const tags = Symbol("tablesTest/tags");
const team = Symbol("tablesTest/team");
const pinned = Symbol("tablesTest/pinned");
const parent = Symbol("tablesTest/parent");
const target = Symbol("tablesTest/target");
const link = Symbol("tablesTest/link");
const friends = Symbol("tablesTest/friends");
const hidden = Symbol("tablesTest/hidden");
const buddy = Symbol("tablesTest/buddy");
const score = Symbol("tablesTest/score");
const title = Symbol("tablesTest/title");
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [label]: { type: string };
        [tags]: { type: readonly string[] };
        [team]: { type: "red" | "blue"; shared: true };
        [pinned]: { type: true };
        [parent]: { type: Entity; reference: "owner" };
        [target]: { type: Entity; reference: "weak" };
        [link]: { type: { readonly to: Entity; readonly weight: number } };
        [friends]: { type: readonly Entity[] };
        [hidden]: { type: true };
        [buddy]: { type: Entity };
    }
    interface Resources {
        [score]: { type: number; default: 0 };
        [title]: { type: string; default: "" };
    }
}

const inline = () => createWorld({ [workers]: 0 });

/** A readonly system's tables of these components. */
const tablesOf = (components: readonly Component.Key[], resources: readonly Resource.Key[] = [], not: readonly Component.Key[] = []) =>
    System.create({ readonly: true, tables: { components, resources, not } }, ({ tables }): Tables => tables);

const spawnedBy: { spawned: Table.Spawned } = { spawned: { entities: [], dropped: 0 } };
const given: { tables: readonly Table[]; resources?: { readonly [key: symbol]: unknown }; existing?: ReadonlyMap<Entity, Entity>; update?: boolean } = { tables: [] };
const spawnGiven = System.create(({ commands }) => {
    spawnedBy.spawned = commands.spawnTables(given.tables, { resources: given.resources, existing: given.existing, update: given.update });
});
const spawnTables = async (world: ReturnType<typeof inline>, tables: readonly Table[], existing?: ReadonlyMap<Entity, Entity>, update?: boolean): Promise<Table.Spawned> => {
    given.tables = tables;
    given.existing = existing;
    given.update = update;
    try {
        await world.run(spawnGiven);
    }
    finally {
        given.existing = undefined;
        given.update = undefined;
    }
    return spawnedBy.spawned;
};

/** Spawns `labels` in `world`, giving each label's entity. */
const spawnLabels = async (world: ReturnType<typeof inline>, labels: readonly string[]): Promise<ReadonlyMap<string, Entity>> => {
    const made = new Map<string, Entity>();
    await world.run(System.create(({ commands }) => {
        for (const text of labels) made.set(text, commands.spawn([label])({ [label]: text }));
    }));
    return made;
};

const values = System.create({ readonly: true, components: { with: [label], optional: [position, parent, target, link, friends, tags, buddy] } }, row => {
    found.push({ entity: row.entity, label: row[label], position: row[position], parent: row[parent], target: row[target], link: row[link], friends: row[friends], tags: row[tags], buddy: row[buddy] });
});
type Found = { entity: Entity; label: string; position?: Vec3; parent?: Entity; target?: Entity; link?: { readonly to: Entity; readonly weight: number }; friends?: readonly Entity[]; tags?: readonly string[]; buddy?: Entity };
const found: Found[] = [];
const readAll = async (world: ReturnType<typeof inline>): Promise<Found[]> => {
    found.length = 0;
    await world.run(values);
    return [...found].sort((a, b) => a.label.localeCompare(b.label));
};

describe("tables", () => {
    it("give each archetype holding a component asked for, its entities, and a copy of each column in the world's layout", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            commands.spawn([position, label])({ [position]: [1, 2, 3], [label]: "a" });
            commands.spawn([position, label, tags])({ [position]: [4, 5, 6], [label]: "b", [tags]: ["x", "y"] });
            commands.spawn([team, label], { [team]: "red" })({ [label]: "c" });
            commands.spawn([pinned])();
        }));
        const { archetypes } = await world.run(tablesOf([position, label, tags, team, pinned]));
        expect(archetypes.map(table => table.count)).toEqual([1, 1, 1, 1]);
        const plain = archetypes.find(table => table.columns[tags] === undefined && table.columns[position] !== undefined);
        const bytes = plain?.columns[position];
        expect(bytes?.kind === "bytes" && [...new Float32Array(bytes.bytes.buffer, bytes.bytes.byteOffset, 3)]).toEqual([1, 2, 3]);
        expect(bytes?.kind === "bytes" && bytes.stride).toBe(12);
        const withTags = archetypes.find(table => table.columns[tags] !== undefined);
        expect(withTags?.columns[tags]).toEqual({ kind: "values", values: [["x", "y"]] });
        expect(withTags?.columns[label]).toEqual({ kind: "values", values: ["b"] });
        const shared = archetypes.find(table => table.columns[team] !== undefined);
        expect(shared?.columns[team]).toEqual({ kind: "value", value: "red" });
        expect(archetypes.find(table => table.columns[pinned] !== undefined)?.columns[pinned]).toEqual({ kind: "value", value: true });
    });

    it("leave out archetypes not matching with and not, and give the values of resources asked for", async () => {
        await using world = createWorld({ [workers]: 0, [score]: 7, [title]: "won" });
        await world.run(System.create(({ commands }) => {
            commands.spawn([label])({ [label]: "shown" });
            commands.spawn([label, hidden])({ [label]: "hidden" });
        }));
        const { archetypes, resources } = await world.run(tablesOf([label], [score, title], [hidden]));
        expect(archetypes.map(table => table.columns[label])).toEqual([{ kind: "values", values: ["shown"] }]);
        expect(resources[score]).toBe(7);
        expect(resources[title]).toBe("won");
    });

    it("spawn back as they were read, shared values and strings included", async () => {
        await using from = inline();
        await from.run(System.create(({ commands }) => {
            commands.spawn([position, label, tags])({ [position]: [1, 2, 3], [label]: "a", [tags]: ["t"] });
            commands.spawn([team, label], { [team]: "blue" })({ [label]: "b" });
        }));
        const { archetypes } = await from.run(tablesOf([position, label, tags, team]));
        await using into = inline();
        const { entities, dropped } = await spawnTables(into, archetypes);
        expect([entities.map(list => list.length), dropped]).toEqual([[1, 1], 0]);
        const again = await into.run(tablesOf([position, label, tags, team]));
        expect(again.archetypes.map(table => ({ ...table, entities: [] }))).toEqual(archetypes.map(table => ({ ...table, entities: [] })));
        expect(await readAll(into)).toMatchObject([{ label: "a", position: [1, 2, 3], tags: ["t"] }, { label: "b" }]);
    });

    it("rewrite entities in references, struct fields and arrays to those spawned for them, self references and cycles included", async () => {
        await using from = inline();
        await from.run(System.create(({ commands }) => {
            const root = commands.spawn([label])({ [label]: "root" });
            const child = commands.spawn([label, parent])({ [label]: "child", [parent]: root });
            commands.spawn([label, target, link, friends])({ [label]: "other", [target]: child, [link]: { to: root, weight: 2 }, [friends]: [root, child] });
            const a = commands.spawn([label, link])({ [label]: "self", [link]: { to: Entity.none, weight: 1 } });
            commands.add(a, link, { to: a, weight: 1 });
        }));
        const before = await readAll(from);
        const { archetypes } = await from.run(tablesOf([label, parent, target, link, friends]));
        await using into = inline();
        // Entities already in the world, so the new ones differ from the old.
        await into.run(System.create(({ commands }) => { for (let i = 0; i < 5; i++) commands.spawn([pinned])(); }));
        await spawnTables(into, archetypes);
        const after = await readAll(into);
        const old = new Map(before.map(entry => [entry.entity, entry.label]));
        const now = new Map(after.map(entry => [entry.label, entry.entity]));
        const translated = (entity: Entity | undefined): Entity | undefined => entity === undefined ? undefined : now.get(old.get(entity) ?? "");
        expect(after.map(entry => entry.label)).toEqual(before.map(entry => entry.label));
        for (const entry of before) {
            const moved = after.find(other => other.label === entry.label);
            expect(moved?.entity).not.toBe(entry.entity);
            expect(moved?.parent).toBe(translated(entry.parent));
            expect(moved?.target).toBe(translated(entry.target));
            expect(moved?.link?.to).toBe(translated(entry.link?.to));
            expect(moved?.friends).toEqual(entry.friends?.map(translated));
        }
        expect(after.find(entry => entry.label === "self")?.link?.to).toBe(now.get("self"));
    });

    it("leave out a weak reference to an entity outside the tables, its holder spawned without it", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            const outside = commands.spawn([pinned])();
            const inside = commands.spawn([label])({ [label]: "inside" });
            commands.spawn([label, target])({ [label]: "away", [target]: outside });
            commands.spawn([label, target])({ [label]: "near", [target]: inside });
        }));
        const { archetypes } = await world.run(tablesOf([label, target]));
        await using other = inline();
        expect((await spawnTables(other, archetypes)).dropped).toBe(0);
        const read = await readAll(other);
        expect(read.map(entry => [entry.label, entry.target === undefined ? "none" : read.find(found => found.entity === entry.target)?.label])).toEqual([["away", "none"], ["inside", "none"], ["near", "inside"]]);
    });

    it("spawn no row owned, directly or through others, by an entity outside the tables, saying how many", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            const outside = commands.spawn([pinned])();
            const top = commands.spawn([label, parent])({ [label]: "top", [parent]: outside });
            const middle = commands.spawn([label, parent])({ [label]: "middle", [parent]: top });
            commands.spawn([label, parent])({ [label]: "bottom", [parent]: middle });
            const kept = commands.spawn([label])({ [label]: "kept" });
            commands.spawn([label, parent, target])({ [label]: "kept child", [parent]: kept, [target]: middle });
        }));
        const { archetypes } = await world.run(tablesOf([label, parent, target]));
        await using other = inline();
        const { entities, dropped } = await spawnTables(other, archetypes);
        expect(dropped).toBe(3);
        expect(entities.flatMap(list => [...list]).filter(entity => entity === Entity.none).length).toBe(3);
        const read = await readAll(other);
        // The kept child's weak target was dropped, so it's spawned without it.
        expect(read.map(entry => [entry.label, entry.parent === undefined ? null : read.find(found => found.entity === entry.parent)?.label, entry.target ?? null])).toEqual([["kept", null, null], ["kept child", "kept", null]]);
    });

    it("make any other entity value naming an entity outside the tables none: a whole component, a struct's field and an array's item", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            const outside = commands.spawn([pinned])();
            const inside = commands.spawn([label])({ [label]: "inside" });
            commands.spawn([label, buddy, link, friends])({ [label]: "pointing", [buddy]: outside, [link]: { to: outside, weight: 1 }, [friends]: [outside, inside] });
        }));
        const { archetypes } = await world.run(tablesOf([label, buddy, link, friends]));
        await using other = inline();
        await spawnTables(other, archetypes);
        const read = await readAll(other);
        const inside = read.find(entry => entry.label === "inside")?.entity;
        expect(read.find(entry => entry.label === "pointing")).toMatchObject({ buddy: Entity.none, link: { to: Entity.none, weight: 1 }, friends: [Entity.none, inside] });
    });

    it("spawn no row existing maps, giving the entity it maps to, which every entity value naming it names", async () => {
        await using world = inline();
        let steel = Entity.none;
        await world.run(System.create(({ commands }) => {
            steel = commands.spawn([label])({ [label]: "steel" });
            commands.spawn([label, parent, target, buddy, link, friends])({ [label]: "body", [parent]: steel, [target]: steel, [buddy]: steel, [link]: { to: steel, weight: 2 }, [friends]: [steel] });
        }));
        const { archetypes } = await world.run(tablesOf([label, parent, target, buddy, link, friends]));
        await using other = inline();
        const existingSteel = (await spawnLabels(other, ["steel in other"])).get("steel in other") ?? Entity.none;
        const { entities, dropped } = await spawnTables(other, archetypes, new Map([[steel, existingSteel]]));
        expect(dropped).toBe(0);
        expect(entities.flatMap(list => [...list])).toContain(existingSteel);
        const read = await readAll(other);
        // Steel isn't spawned again: the body's every entity value names the one already there.
        expect(read.map(entry => entry.label)).toEqual(["body", "steel in other"]);
        expect(read.find(entry => entry.label === "body")).toMatchObject({ parent: existingSteel, target: existingSteel, buddy: existingSteel, link: { to: existingSteel, weight: 2 }, friends: [existingSteel] });
    });

    it("let an entity existing maps stand for one outside the tables, so what it owns or points at is kept", async () => {
        await using world = inline();
        let steel = Entity.none;
        await world.run(System.create(({ commands }) => {
            steel = commands.spawn([pinned])();
            commands.spawn([label, parent, target])({ [label]: "owned", [parent]: steel, [target]: steel });
        }));
        const { archetypes } = await world.run(tablesOf([label, parent, target]));
        await using other = inline();
        const existingSteel = (await spawnLabels(other, ["steel"])).get("steel") ?? Entity.none;
        const { dropped } = await spawnTables(other, archetypes, new Map([[steel, existingSteel]]));
        expect(dropped).toBe(0);
        expect((await readAll(other)).find(entry => entry.label === "owned")).toMatchObject({ parent: existingSteel, target: existingSteel });
    });

    it("write a row existing maps onto its entity with update, as an add would, entity values rewritten as a spawned row's", async () => {
        await using world = inline();
        let steel = Entity.none;
        await world.run(System.create(({ commands }) => {
            const inside = commands.spawn([label])({ [label]: "inside" });
            const outside = commands.spawn([pinned])();
            steel = commands.spawn([label, position, buddy, target, link, team], { [team]: "red" })({ [label]: "steel", [position]: [1, 2, 3], [buddy]: inside, [target]: outside, [link]: { to: inside, weight: 4 } });
        }));
        const { archetypes } = await world.run(tablesOf([label, position, buddy, target, link, team]));
        await using other = inline();
        let mine = Entity.none, kept = Entity.none;
        await other.run(System.create(({ commands }) => {
            kept = commands.spawn([label])({ [label]: "kept" });
            mine = commands.spawn([label, hidden, target, team], { [team]: "blue" })({ [label]: "mine", [target]: kept });
        }));
        const changed: string[] = [];
        const watch = System.create({ components: { with: [label], changed: [label] } }, row => { changed.push(row[label]); });
        await other.run(watch);
        changed.length = 0;
        const { entities, dropped } = await spawnTables(other, archetypes, new Map([[steel, mine]]), true);
        expect([dropped, entities.flatMap(list => [...list]).includes(mine)]).toEqual([0, true]);
        const read = await readAll(other);
        const inside = read.find(entry => entry.label === "inside")?.entity;
        // The weak reference to an entity outside the tables is left out, so the entity's own stands.
        expect(read.find(entry => entry.entity === mine)).toMatchObject({ label: "steel", position: [1, 2, 3], buddy: inside, target: kept, link: { to: inside, weight: 4 } });
        const teams = await other.run(System.create({ readonly: true, tables: { components: [team, hidden] } }, ({ tables }) => tables.archetypes.map(table => [table.columns[team], table.columns[hidden] !== undefined])));
        expect(teams).toEqual([[{ kind: "value", value: "red" }, true]]);
        await other.run(watch);
        expect(changed.sort()).toEqual(["inside", "steel"]);
    });

    it("refuse existing mapping to an entity that isn't alive, spawning nothing", async () => {
        await using world = inline();
        const gone = (await spawnLabels(world, ["gone"])).get("gone") ?? Entity.none;
        await world.run(System.create(({ commands }) => { commands.despawn(gone); }));
        const { archetypes } = await world.run(tablesOf([label]));
        await using source = inline();
        const steel = (await spawnLabels(source, ["steel"])).get("steel") ?? Entity.none;
        const { archetypes: tables } = await source.run(tablesOf([label]));
        expect(archetypes).toEqual([]);
        await expect(spawnTables(world, tables, new Map([[steel, gone]]))).rejects.toThrow(new RegExp(`as entity ${gone}, which isn't alive`));
        expect(await readAll(world)).toEqual([]);
    });

    it("set the resources they're given at the sync point, beside the entities", async () => {
        await using world = createWorld({ [workers]: 0, [score]: 7 });
        given.tables = [];
        given.resources = { [score]: 12, [title]: "loaded" };
        try {
            await world.run(spawnGiven);
        }
        finally {
            given.resources = undefined;
        }
        const { resources } = await world.run(tablesOf([label], [score, title]));
        expect(resources[score]).toBe(12);
        expect(resources[title]).toBe("loaded");
    });

    it("refuse a resource only the world writes or a value its type doesn't take, spawning nothing", async () => {
        await using world = inline();
        const table: Table = { count: 1, entities: new Float64Array([1]), columns: { [label]: { kind: "values", values: ["kept out"] } } };
        given.tables = [table];
        try {
            given.resources = { [clock]: { now: 0, delta: 0, tick: 0 } };
            await expect(world.run(spawnGiven)).rejects.toThrow(/clock" is written only by the world/);
            given.resources = { [score]: "twelve" };
            await expect(world.run(spawnGiven)).rejects.toThrow(/score" is given a value its type doesn't take/);
            given.resources = { [position]: [0, 0, 0] };
            await expect(world.run(spawnGiven)).rejects.toThrow(/position" isn't a registered resource/);
        }
        finally {
            given.resources = undefined;
        }
        expect(await readAll(world)).toEqual([]);
        expect((await world.run(tablesOf([label], [score]))).resources[score]).toBe(0);
    });

    it("fail a column that doesn't fit its component's layout or its table's count", async () => {
        await using world = inline();
        const table = (columns: Table["columns"], count = 1): Table => ({ count, entities: new Float64Array(count).fill(1), columns });
        given.tables = [table({ [position]: { kind: "bytes", bytes: new Uint8Array(8), stride: 8 } })];
        await expect(world.run(spawnGiven)).rejects.toThrow(/stride of 12 bytes in this world, not 8/);
        given.tables = [table({ [position]: { kind: "bytes", bytes: new Uint8Array(24), stride: 12 } })];
        await expect(world.run(spawnGiven)).rejects.toThrow(/gives 24 bytes for 1 rows of 12/);
        given.tables = [table({ [label]: { kind: "values", values: ["a", "b"] } })];
        await expect(world.run(spawnGiven)).rejects.toThrow(/gives 2 values for 1 rows/);
        given.tables = [table({ [team]: { kind: "values", values: ["red"] } })];
        await expect(world.run(spawnGiven)).rejects.toThrow(/shared component, so its column is one value/);
        // Two rows of one entity can't both be what a reference to it names.
        given.tables = [table({ [friends]: { kind: "values", values: [[]] } }, 1), table({ [friends]: { kind: "values", values: [[]] } }, 1)];
        await expect(world.run(spawnGiven)).rejects.toThrow(/entity 1 is in two rows/);
        expect(await readAll(world)).toEqual([]);
    });

    it("keep to the archetypes holding where's shared values, each required as with requires it", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => {
            commands.spawn([team, label], { [team]: "red" })({ [label]: "red" });
            commands.spawn([team, label, position], { [team]: "red" })({ [label]: "red placed", [position]: [1, 1, 1] });
            commands.spawn([team, label], { [team]: "blue" })({ [label]: "blue" });
            commands.spawn([label])({ [label]: "none" });
        }));
        const red = await world.run(System.create({ readonly: true, tables: { components: [label], where: { [team]: "red" } } }, ({ tables }): Tables => tables));
        expect(red.archetypes.map(table => table.columns[label]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
            .toEqual([{ kind: "values", values: ["red placed"] }, { kind: "values", values: ["red"] }]);
        const placed = await world.run(System.create({ readonly: true, tables: { components: [label], with: [position], where: { [team]: "red" } } }, ({ tables }): Tables => tables));
        expect(placed.archetypes.map(table => table.columns[label])).toEqual([{ kind: "values", values: ["red placed"] }]);
        // One system's tables follow its archetypes as they come and go.
        const blue = System.create({ readonly: true, tables: { components: [label], where: { [team]: "blue" } } }, ({ tables }): Tables => tables);
        expect((await world.run(blue)).archetypes.map(table => table.count)).toEqual([1]);
        await world.run(System.create(({ commands }) => {
            commands.spawn([team, label, position], { [team]: "blue" })({ [label]: "blue placed", [position]: [2, 2, 2] });
        }));
        expect((await world.run(blue)).archetypes.map(table => table.count)).toEqual([1, 1]);
    });

    it("give no table for a shared value no archetype holds", async () => {
        await using world = inline();
        await world.run(System.create(({ commands }) => { commands.spawn([team, label], { [team]: "red" })({ [label]: "red" }); }));
        const blue = System.create({ readonly: true, tables: { components: [label], where: { [team]: "blue" } } }, ({ tables }): Tables => tables);
        expect((await world.run(blue)).archetypes).toEqual([]);
        await world.run(System.create(({ commands }) => { commands.spawn([team, label], { [team]: "blue" })({ [label]: "blue" }); }));
        expect((await world.run(blue)).archetypes.map(table => table.columns[label])).toEqual([{ kind: "values", values: ["blue"] }]);
    });

    it("take only values of shared components in where", () => {
        // @ts-expect-error: where names only shared components.
        expect(() => System.create({ readonly: true, tables: { components: [label], where: { [label]: "a" } } }, () => {})).toThrow(/tables' where names "tablesTest\/label", which isn't a shared component/);
        // @ts-expect-error: tables' where takes values, not predicates.
        expect(() => System.create({ readonly: true, tables: { components: [label], where: { [team]: (value: string) => value === "red" } } }, () => {})).toThrow(/tables' where gives "tablesTest\/team" a predicate/);
        // @ts-expect-error: a value of the component's type.
        expect(() => System.create({ readonly: true, tables: { components: [label], where: { [team]: "green" } } }, () => {})).toThrow(/isn't one of its type's values/);
    });

    it("are read only by a readonly system without components", () => {
        // @ts-expect-error: tables are read only by a readonly system, which the declaration's type says too.
        expect(() => System.create({ tables: { components: [label] } }, () => {})).toThrow(/reads tables, which only a readonly system reads/);
    });
});

describe("declarations", () => {
    it("give every component and resource registered, with its schema and traits", () => {
        const declared = Component.declarations().get(parent);
        expect(declared?.type).toEqual({ type: "integer", format: "entity" });
        expect(declared?.reference).toBe("owner");
        expect(Resource.declarations().get(score)?.default).toBe(0);
        const components: readonly symbol[] = [...Component.declarations().keys()];
        expect(components.includes(score)).toBe(false);
    });
});
