// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Database } from "./database.js";
import { Entity } from "../entity/entity.js";
import { Observe } from "../../observe/index.js";

/**
 * Compile-time tests for `Database.Read<DB>` and the `db.derive`
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
    const gotten = db.derive((d) => d.get(0 as Entity, "x"));
    type _Gotten = Assert<Equal<typeof gotten, Observe<number | undefined>>>;

    const selected = db.derive((d) => d.select(["x"]));
    type _Selected = Assert<Equal<typeof selected, Observe<readonly Entity[]>>>;

    // presence `select` — `exclude` is allowed (membership-based)
    db.derive((d) => d.select(["x"], { exclude: ["y"] }));
    // …but the value-dependent options are NOT on the derive surface: they can
    // only be tracked coarsely, so a value-keyed / ordered reactive read must go
    // through a declared index.
    db.derive((d) =>
        // @ts-expect-error `where` is not offered on a derive's select — use an index
        d.select(["x"], { where: { x: 1 } }),
    );
    db.derive((d) =>
        // @ts-expect-error `order` is not offered on a derive's select — use an index
        d.select(["x"], { order: { x: true } }),
    );

    // whole-entity read
    db.derive((d) => d.read(0 as Entity));

    // projection read: exactly the requested fields, optionality preserved,
    // unrequested fields (incl. id) excluded
    db.derive((d) => {
        const p = d.read(0 as Entity, ["x", "y"]);
        if (p !== null) {
            const _x: number | undefined = p.x;
            const _y: string | undefined = p.y;
            void _x;
            void _y;
            // @ts-expect-error `id` was not requested, so it is not on the projection
            p.id;
        }
        return p;
    });

    // archetype read: narrowed to the archetype's own row (no extra fields)
    db.derive((d) => {
        const foo = d.read(0 as Entity, db.archetypes.Foo);
        if (foo !== null) {
            const _x: number = foo.x;
            // @ts-expect-error `y` is not part of the Foo archetype — narrowed read excludes it
            foo.y;
        }
        return foo;
    });

    // resource reads
    const frameRate = db.derive((d) => d.resources.frameRate);
    type _FrameRate = Assert<Equal<typeof frameRate, Observe<number>>>;

    // archetype identity — and the realistic composition select(archetype.components)
    db.derive((d) => d.archetypes.Foo.components);
    db.derive((d) => d.archetypes.Foo.id);
    db.derive((d) => d.select(d.archetypes.Foo.components));

    // index lookups
    db.derive((d) => d.indexes.byX.find({ x: 1 }));
    db.derive((d) => d.indexes.byX.findRange({ x: 1 }));
    // a unique index also exposes `get`
    const head = db.derive((d) => d.indexes.byXUnique.get({ x: 1 }));
    type _Head = Assert<Equal<typeof head, Observe<Entity | null>>>;
}

// ============================================================================
// derive — NEGATIVE: everything the read projection removes
// ============================================================================

function deriveNegative() {
    db.derive((d) => {
        // @ts-expect-error observers are not exposed — a derive subscribes to its own reads
        return d.observe;
    });
    db.derive((d) => {
        // @ts-expect-error transactions / writes are not exposed to a read-only derive
        return d.transactions;
    });
    db.derive((d) => {
        // @ts-expect-error queryArchetypes (raw column access) is not exposed
        return d.queryArchetypes;
    });
    db.derive((d) => {
        // @ts-expect-error locate (row access) is not exposed
        return d.locate;
    });
    db.derive((d) => {
        // @ts-expect-error per-archetype column access is not exposed
        return d.archetypes.Foo.columns;
    });
    db.derive((d) => {
        // @ts-expect-error per-archetype rowCount (table access) is not exposed
        return d.archetypes.Foo.rowCount;
    });
    db.derive((d) => {
        // @ts-expect-error per-archetype insert (write) is not exposed
        return d.archetypes.Foo.insert;
    });
    db.derive((d) => {
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
    const excluded: readonly Entity[] = rd.select(["x"], { exclude: ["y"] });
    const fr: number = rd.resources.frameRate;
    rd.archetypes.Foo.components.has("x");
    const found: readonly Entity[] = rd.indexes.byX.find({ x: 1 });
    void v;
    void ids;
    void excluded;
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
    // @ts-expect-error `where` (value-dependent) omitted from the read projection's select
    rd.select(["x"], { where: { x: 1 } });
    // @ts-expect-error `order` (value-dependent) omitted from the read projection's select
    rd.select(["x"], { order: { x: true } });
}

// ============================================================================
// Read distributes over an INTERSECTION (Option A). The structural definition
// means `Database.Read<A & B>` merges both members' read surfaces, and because
// `derive` passes `Database.Read<this>`, a derive on an intersection receiver
// sees indexes + resources + archetypes from BOTH members — so a consumer of a
// composed `A & B` database (e.g. an indexed core intersected with a
// resource-computed layer) never needs to cast.
// ============================================================================

const pluginA = Database.Plugin.create({
    components: { a: { type: "number" } },
    resources: { ra: { type: "number", default: 0 } },
    archetypes: { AOnly: ["a"] },
    indexes: { byA: { key: "a" } },
});
const pluginB = Database.Plugin.create({
    components: { b: { type: "string" } },
    resources: { rb: { type: "string", default: "" } },
    archetypes: { BOnly: ["b"] },
    indexes: { byB: { key: "b" } },
});

const dbA = Database.create(pluginA);
const dbB = Database.create(pluginB);
type Both = typeof dbA & typeof dbB;

declare const rb2: Database.Read<Both>;
declare const both: Both;

function intersectionRead() {
    // both members' resources
    const _ra: number = rb2.resources.ra;
    const _rb: string = rb2.resources.rb;
    // both members' indexes (find-only)
    const _fa: readonly Entity[] = rb2.indexes.byA.find({ a: 1 });
    const _fb: readonly Entity[] = rb2.indexes.byB.find({ b: "x" });
    // both members' archetype identities
    rb2.archetypes.AOnly.components.has("a");
    rb2.archetypes.BOnly.components.has("b");
    void _ra;
    void _rb;
    void _fa;
    void _fb;
}

function intersectionDerive() {
    // `Database.Read<this>` on an intersection receiver → merged surface.
    both.derive((d) => {
        const _ra: number = d.resources.ra;
        const _rb: string = d.resources.rb;
        d.indexes.byA.find({ a: 1 });
        d.indexes.byB.find({ b: "x" });
        void _ra;
        void _rb;
        return 0;
    });
}
