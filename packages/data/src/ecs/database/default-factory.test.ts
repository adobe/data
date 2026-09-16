// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// End-to-end tests for insert-time default-factory components, exercised through
// the full plugin chain (Database.create → transaction body store → archetype
// insert). A component whose schema names a `defaultFactory` is optional at
// insert: omit it and the archetype mints a fresh value via the registry-resolved
// factory; supply it (the replication-inbound / load path) and the supplied value
// wins. See Schema.defaultFactory and CreateStoreOptions.defaultFactories.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";
import type { Schema } from "../../schema/index.js";

// `guid` stands in for a cross-runtime identity: a value the archetype must have
// at creation but that callers usually don't supply. `defaultFactory: "guid"`
// names the minting factory; the registry (below) provides it.
const guid = { type: "number", default: 0, defaultFactory: "guid" } as const satisfies Schema;
const value = { type: "number", default: 0 } as const satisfies Schema;

const nodePlugin = Database.Plugin.create({
    components: { guid, value },
    archetypes: { Node: ["guid", "value"] } as const,
    transactions: {
        // `guid` omitted from the row → the archetype mints it. This is the ~30
        // insert sites' shape: no guid threaded, still compiles.
        addNode(t, args: { value: number }) {
            return t.archetypes.Node.insert(args);
        },
        // `guid` supplied → adopted verbatim (replication-inbound / load).
        adoptNode(t, args: { value: number; guid: number }) {
            return t.archetypes.Node.insert(args);
        },
    },
});

const withRegistry = (start = 1000) => {
    let next = start;
    return {
        db: Database.create(nodePlugin, { defaultFactories: { guid: () => next++ } }),
        minted: () => next,
    };
};

describe("insert-time default-factory (full plugin chain)", () => {
    it("mints an omitted default-factory component at creation, fresh per insert", () => {
        const { db, minted } = withRegistry(1000);

        const a = db.transactions.addNode({ value: 1 });
        const b = db.transactions.addNode({ value: 2 });

        expect(db.read(a)?.guid).toBe(1000);
        expect(db.read(b)?.guid).toBe(1001);
        expect(minted()).toBe(1002); // one mint per insert, no more
    });

    it("adopts a supplied value instead of minting (replication-inbound / load)", () => {
        const { db, minted } = withRegistry(1000);

        const e = db.transactions.adoptNode({ value: 7, guid: 55 });

        expect(db.read(e)?.guid).toBe(55);
        expect(minted()).toBe(1000); // factory never ran for the supplied value
    });

    it("throws at archetype construction when a named factory was never registered", () => {
        // No defaultFactories registry → `guid` names a factory the store lacks.
        expect(() => {
            const db = Database.create(nodePlugin);
            db.transactions.addNode({ value: 1 });
        }).toThrow(/defaultFactory "guid"/);
    });
});

// Compile-time checks — the payoff for consumers: inside a transaction / system
// body (the mutable store `t`), default-factory components are optional at insert
// while every other component stays required. This is the shape the ~30 insert
// sites rely on.
{
    type NodeStore = Database.Plugin.ToStore<typeof nodePlugin>;
    const _typeChecks = (t: NodeStore) => {
        t.archetypes.Node.insert({ value: 1 });          // guid omitted → OK (minted)
        t.archetypes.Node.insert({ value: 1, guid: 2 });  // guid supplied → OK (adopted)
        // @ts-expect-error - `value` is not a default-factory key, still required.
        t.archetypes.Node.insert({ guid: 2 });
    };
}
