// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Database } from "./database.js";
import { Entity } from "../entity/entity.js";
import { Observe } from "../../observe/index.js";

/**
 * Compile-time tests for `Database.Read<DB>` and the `db.observe.derive`
 * callback surface. Type-only — nothing here executes. `@ts-expect-error`
 * marks the accesses that MUST NOT compile (the footguns the read projection
 * removes structurally).
 */

const plugin = Database.Plugin.create({
    components: {
        x: { type: "number" },
        y: { type: "string" },
    },
    resources: {
        frameRate: { type: "number", default: 30 },
    },
    archetypes: {
        Foo: ["x"],
    },
    indexes: {
        byX: { key: "x" },
        byXUnique: { key: "x", unique: true },
    },
});

const db = Database.create(plugin);

// ============================================================================
// derive — POSITIVE: the read surface a compute body is allowed to touch
// ============================================================================

function derivePositive() {
    // value reads
    const gotten = db.observe.derive((d) => d.get(0 as Entity, "x"));
    type _Gotten = Assert<Equal<typeof gotten, Observe<number | undefined>>>;

    const selected = db.observe.derive((d) => d.select(["x"]));
    type _Selected = Assert<Equal<typeof selected, Observe<readonly Entity[]>>>;

    db.observe.derive((d) => d.read(0 as Entity));

    // resource reads
    const frameRate = db.observe.derive((d) => d.resources.frameRate);
    type _FrameRate = Assert<Equal<typeof frameRate, Observe<number>>>;

    // archetype identity — and the realistic composition select(archetype.components)
    db.observe.derive((d) => d.archetypes.Foo.components);
    db.observe.derive((d) => d.archetypes.Foo.id);
    db.observe.derive((d) => d.select(d.archetypes.Foo.components));

    // index lookups
    db.observe.derive((d) => d.indexes.byX.find({ x: 1 }));
    db.observe.derive((d) => d.indexes.byX.findRange({ x: 1 }));
    // a unique index also exposes `get`
    const head = db.observe.derive((d) => d.indexes.byXUnique.get({ x: 1 }));
    type _Head = Assert<Equal<typeof head, Observe<Entity | null>>>;

    // options.equals
    db.observe.derive((d) => d.get(0 as Entity, "x"), { equals: (a, b) => a === b });
}

// ============================================================================
// derive — NEGATIVE: everything the read projection removes
// ============================================================================

function deriveNegative() {
    db.observe.derive((d) => {
        // @ts-expect-error observers are not exposed — a derive subscribes to its own reads
        return d.observe;
    });
    db.observe.derive((d) => {
        // @ts-expect-error transactions / writes are not exposed to a read-only derive
        return d.transactions;
    });
    db.observe.derive((d) => {
        // @ts-expect-error queryArchetypes (raw column access) is not exposed
        return d.queryArchetypes;
    });
    db.observe.derive((d) => {
        // @ts-expect-error locate (row access) is not exposed
        return d.locate;
    });
    db.observe.derive((d) => {
        // @ts-expect-error per-archetype column access is not exposed
        return d.archetypes.Foo.columns;
    });
    db.observe.derive((d) => {
        // @ts-expect-error per-archetype rowCount (table access) is not exposed
        return d.archetypes.Foo.rowCount;
    });
    db.observe.derive((d) => {
        // @ts-expect-error per-archetype insert (write) is not exposed
        return d.archetypes.Foo.insert;
    });
    db.observe.derive((d) => {
        // @ts-expect-error index observe is not exposed — a derive subscribes for you
        return d.indexes.byX.observe;
    });
}

// ============================================================================
// Database.Read<DB> directly (the public projection type)
// ============================================================================

type ReadDb = Database.Read<typeof db>;
declare const rd: ReadDb;

function readProjectionPositive() {
    const v: number | undefined = rd.get(0 as Entity, "x");
    const ids: readonly Entity[] = rd.select(["x"]);
    const fr: number = rd.resources.frameRate;
    rd.archetypes.Foo.components.has("x");
    const found: readonly Entity[] = rd.indexes.byX.find({ x: 1 });
    void v;
    void ids;
    void fr;
    void found;
}

function readProjectionNegative() {
    // @ts-expect-error observers omitted from the read projection
    rd.observe;
    // @ts-expect-error index observe omitted from the read projection
    rd.indexes.byX.observe;
    // @ts-expect-error table/column access omitted from the read projection
    rd.archetypes.Foo.columns;
    // @ts-expect-error transactions omitted from the read projection
    rd.transactions;
}
