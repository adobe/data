// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Extends } from "../../types/types.js";
import { ReadonlyArchetype } from "../archetype/index.js";
import { Entity } from "../entity/entity.js";
import { Observe } from "../../observe/index.js";

/**
 * Type-only tests for naming archetype rows without a cast.
 *
 * The regression these guard against: a consumer who exposes
 * `db.archetypes.Track` under a hand-authored service interface used to need
 * `as unknown as` at every boundary. The fix is to *derive* the service type
 * from the plugin and *name* rows with `Database.Archetype.RowOf` rather than
 * re-spelling their columns. These are compile-time checks only.
 */

const trackPlugin = createPlugin({
    components: {
        trackKind: { type: "string" },
        editingMode: { type: "string" },
        muted: { type: "boolean" },
    },
    archetypes: {
        Track: ["trackKind", "editingMode", "muted"],
    },
});

// A service type derived from the plugin — the recommended pattern.
type MainService = Database.Plugin.ToDatabase<typeof trackPlugin>;

declare const db: MainService;

// 1. `db.archetypes` assigns to the derived service's archetype map with NO cast.
const archetypes: MainService["archetypes"] = db.archetypes;
void archetypes;

// 2. `RowOf` extracts the full structural row, including the implicit `id`.
type TrackRow = Database.Archetype.RowOf<MainService, "Track">;
type CheckRow = Assert<Equal<TrackRow, {
    readonly id: Entity;
    readonly trackKind: string;
    readonly editingMode: string;
    readonly muted: boolean;
}>>;

// 3. A named row round-trips: `ReadonlyArchetype<RowOf<...>>` accepts the handle
//    with no cast, because it is structurally the same archetype.
const track: ReadonlyArchetype<TrackRow> = db.archetypes.Track;
void track;

// 4. The row flows through `observe.entity(id, archetype)` with no per-entity
//    cast — the other place the consumer reported having to launder the type.
//    The non-null emitted value carries the Track row fields.
declare const someEntity: Entity;
const observed = db.observe.entity(someEntity, db.archetypes.Track);
type Emitted = typeof observed extends Observe<infer V> ? V : never;
type CheckObservedCarriesRow = Assert<Extends<NonNullable<Emitted>, TrackRow>>;
void observed;
