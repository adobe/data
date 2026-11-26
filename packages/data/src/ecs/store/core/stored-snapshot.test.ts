// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Store } from "../store.js";
import { Entity } from "../../entity/entity.js";
import { F32 } from "../../../math/index.js";
import { deserializeFromJSON, serializeToJSON } from "../../../functions/index.js";
import { snapshot_0_10_36 as fixtureJson } from "./fixtures/snapshot-0.10.36.js";

// `fixtures/snapshot-0.10.36.ts` holds `serializeToJSON(store.toData({ copy: true }), { space: 2 })`
// from @adobe/data 0.10.36, for this schema after `insertFixtureEntities`. Its ids are 4, 8, 12 and
// 16 (`gone` = 12 deleted), with the `selected` resource at 0.
const createFixtureStore = () => Store.create({
    components: {
        name: { type: "string", default: "" },
        parent: Entity.schema,
        target: { oneOf: [Entity.schema, { type: "null" }], default: null },
        link: { type: "object", properties: { to: Entity.schema, weight: F32.schema }, required: ["to", "weight"], default: { to: 0, weight: 0 } },
        members: { type: "array", items: Entity.schema, default: [] },
    },
    resources: { selected: { ...Entity.schema, default: Entity.none } },
    archetypes: { Node: ["name", "parent", "target", "link", "members"] },
});

const insertFixtureEntities = (store: ReturnType<typeof createFixtureStore>) => {
    const a = store.archetypes.Node.insert({ name: "a", parent: 0, target: null, link: { to: 0, weight: 1 }, members: [] });
    const b = store.archetypes.Node.insert({ name: "b", parent: a, target: a, link: { to: a, weight: 2 }, members: [a] });
    const gone = store.archetypes.Node.insert({ name: "gone", parent: a, target: null, link: { to: a, weight: 3 }, members: [] });
    const c = store.archetypes.Node.insert({ name: "c", parent: b, target: gone, link: { to: b, weight: 4 }, members: [a, b] });
    store.delete(gone);
    store.resources.selected = c;
    return { a, b, gone, c };
};

describe("stored snapshot format", () => {
    it("loads a 0.10.36 snapshot, with ids at generation 0", async () => {
        const store = createFixtureStore();
        store.fromData(await deserializeFromJSON(fixtureJson));

        expect(store.read(4)).toEqual({ name: "a", parent: 0, target: null, link: { to: 0, weight: 1 }, members: [] });
        expect(store.read(8)).toEqual({ name: "b", parent: 4, target: 4, link: { to: 4, weight: 2 }, members: [4] });
        expect(store.read(16)).toEqual({ name: "c", parent: 8, target: 12, link: { to: 8, weight: 4 }, members: [4, 8] });
        expect(store.resources.selected).toBe(16);
        expect(store.read(12)).toBeNull();
    });

    it("keeps a stored reference to a deleted entity stale once its slot is reused", async () => {
        const store = createFixtureStore();
        store.fromData(await deserializeFromJSON(fixtureJson));

        const reused = store.archetypes.Node.insert({ name: "new", parent: 0, target: null, link: { to: 0, weight: 0 }, members: [] });
        expect(Entity.toLocalIndex(reused)).toBe(Entity.toLocalIndex(12));
        expect(Entity.generationOf(reused)).toBe(1);
        expect(store.read(16)?.target).toBe(12);
        expect(store.read(12)).toBeNull();
    });

    it("writes the 0.10.36 format exactly", async () => {
        const store = createFixtureStore();
        insertFixtureEntities(store);
        expect(await serializeToJSON(store.toData({ copy: true }), { space: 2 })).toBe(fixtureJson);
    });

    it("writes ids without their generation, and reloads them at generation 0", async () => {
        const store = createFixtureStore();
        const { a, gone } = insertFixtureEntities(store);
        const reused = store.archetypes.Node.insert({ name: "new", parent: a, target: gone, link: { to: a, weight: 5 }, members: [a] });
        store.resources.selected = reused;
        expect(Entity.generationOf(reused)).toBe(1);

        const snapshot = store.toData({ copy: true }) as { componentSchemas: Record<string, unknown> };
        expect(snapshot.componentSchemas.parent).toEqual({ type: "integer", minimum: -2147483648, maximum: 2147483647, default: 0, entity: true });

        const loaded = createFixtureStore();
        loaded.fromData(await deserializeFromJSON(await serializeToJSON(snapshot)));
        const stored = Entity.toEntity(Entity.toLocalIndex(reused), 0);
        expect(loaded.resources.selected).toBe(stored);
        // A reference that was already dangling when saved now names the reused slot: the known gap.
        expect(loaded.read(stored)).toEqual({ name: "new", parent: a, target: stored, link: { to: a, weight: 5 }, members: [a] });
    });

    it("stores Entity.none as -1 and reads it back", async () => {
        const store = createFixtureStore();
        const snapshot = store.toData({ copy: true });
        const loaded = createFixtureStore();
        loaded.resources.selected = 4;
        loaded.fromData(await deserializeFromJSON(await serializeToJSON(snapshot)));
        expect(loaded.resources.selected).toBe(Entity.none);
    });
});
