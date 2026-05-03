// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Centralized type assertions used by the persistence service. These
// are the only casts in the package; every other module uses the
// public types. Each cast here is justified by a comment explaining
// what runtime contract makes it sound.

import type { Archetype, Database, ReadonlyArchetype } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import type { TypedBuffer } from "@adobe/data/typed-buffer";

/**
 * Database augmented with the runtime-exposed `store` property.
 *
 * Justification: `createDatabase()` always sets `db.store = store` at
 * runtime (see `packages/data/src/ecs/database/public/create-database.ts`),
 * but the public `Database` interface deliberately hides it so that
 * normal callers cannot bypass the transaction observer. The
 * persistence service IS the observer, so it has a legitimate need to
 * read mutable archetype state directly. This type mirrors the
 * already-public `Database.Plugin.ToSystemDatabase` shape.
 */
type DatabaseWithStore = Database<any, any, any, any, any, any, any, any> & {
    readonly store: Store<any, any, any>;
};

/**
 * Return the mutable {@link Store} that backs `database`. The cast is
 * sound because every database produced by `createDatabase()` exposes
 * `.store` at runtime (see `DatabaseWithStore` for the contract).
 */
export const getMutableStore = (
    database: Database<any, any, any, any, any, any, any, any>,
): Store<any, any, any> => (database as DatabaseWithStore).store;

/**
 * Return the named archetype as its mutable view. The runtime objects
 * exposed by `store.archetypes[name]` are the same instances created
 * with mutable `rowCount` / `rowCapacity` and writable column buffers;
 * only the public type narrows them to {@link ReadonlyArchetype}.
 */
export const asMutableArchetype = (
    a: ReadonlyArchetype<any>,
): Archetype<any> => a as Archetype<any>;

/**
 * Look up a column buffer by its component name. The columns object's
 * declared type uses specific component keys; this helper widens that
 * to a string-indexed view so we can iterate based on
 * `archetype.components` (a `ReadonlySet<string>`).
 *
 * Returns `undefined` when the component is absent — the runtime
 * shape guarantees the value is either a `TypedBuffer<unknown>` or
 * missing.
 */
export const getColumn = (
    archetype: ReadonlyArchetype<any>,
    component: string,
): TypedBuffer<unknown> | undefined => {
    const columns = archetype.columns as Record<string, TypedBuffer<unknown> | undefined>;
    return columns[component];
};

/**
 * Like {@link getColumn} but returns a `TypedBuffer<number>`. Used
 * for the implicit `id` column, which always stores entity ids.
 * Returns `undefined` when the archetype has no `id` column (which
 * shouldn't happen in normal operation; callers handle it defensively).
 */
export const getIdColumn = (
    archetype: ReadonlyArchetype<any>,
): TypedBuffer<number> | undefined => {
    return getColumn(archetype, "id") as TypedBuffer<number> | undefined;
};
