import { describe, expect, it } from "vitest";
import { Database, Entity, type Store } from "@adobe/data/ecs";
import { nodeData } from "./node-data-plugin.js";

const createTestDb = () => Database.create(nodeData);

const storeOf = (db: ReturnType<typeof createTestDb>) =>
    (db as unknown as { store: Store<any, any, any> }).store;

const identityNode = () => ({
    position: [0, 0, 0] as const,
    rotation: [0, 0, 0, 1] as const,
    scale: [1, 1, 1] as const,
    visible: true,
    parent: 0 as Entity,
});

describe("nodeChildrenOf index", () => {
    it("finds direct children of a parent node", () => {
        const db = createTestDb();
        const store = storeOf(db);
        store.archetypes.Node.insert(identityNode()); // entity 0 — keeps parent id non-zero
        const parent = store.archetypes.Node.insert(identityNode());
        const childA = store.archetypes.Node.insert({ ...identityNode(), parent });
        const childB = store.archetypes.Node.insert({ ...identityNode(), parent });
        store.archetypes.Node.insert(identityNode()); // other root (parent === 0)

        const children = db.indexes.nodeChildrenOf.find({ parent });
        expect(children).toHaveLength(2);
        expect(children).toContain(childA);
        expect(children).toContain(childB);
        expect(children).not.toContain(parent);
    });

    it("updates buckets when parent changes", () => {
        const db = createTestDb();
        const store = storeOf(db);
        const parentA = store.archetypes.Node.insert(identityNode());
        const parentB = store.archetypes.Node.insert(identityNode());
        const child = store.archetypes.Node.insert({ ...identityNode(), parent: parentA });

        expect(db.indexes.nodeChildrenOf.find({ parent: parentA })).toContain(child);
        store.update(child, { parent: parentB });
        expect(db.indexes.nodeChildrenOf.find({ parent: parentA })).not.toContain(child);
        expect(db.indexes.nodeChildrenOf.find({ parent: parentB })).toContain(child);
    });
});
