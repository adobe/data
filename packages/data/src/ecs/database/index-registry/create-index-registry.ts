// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import type { TransactionResult } from "../transactional-store/index.js";
import { createIndex, IndexState, RuntimeIndex } from "./create-index.js";

/**
 * Reads the post-transaction values of an entity, or returns null when the
 * entity does not exist. Supplied by `createDatabase` so the registry stays
 * decoupled from the store layer.
 */
export type EntityReader = (entity: Entity) => Readonly<Record<string, unknown>> | null;

/**
 * Iterates every live entity at the moment of the call. Used to populate a
 * newly registered index from existing state, and to rebuild all indexes
 * after `reset()` / `fromData()`.
 */
export type EntityIterator = () => Iterable<Entity>;

/**
 * Plugin-level declaration object as it appears in `plugin.indexes[name]`.
 * The registry holds the *exact* reference so the same-name re-registration
 * check can compare identity (`===`) — matching the rule
 * `combinePlugins` already enforces for components / transactions / etc.
 */
export type IndexDeclarationObject = {
    readonly components: readonly string[];
    readonly unique?: boolean;
};

interface RegisteredEntry {
    /** Identity-shared declaration object as supplied by the plugin. */
    readonly decl: IndexDeclarationObject;
    /** Materialised state used by the runtime index. */
    readonly index: RuntimeIndex;
}

export interface IndexRegistry {
    /** Read access to the runtime indexes, keyed by user-chosen name. */
    readonly indexes: ReadonlyMap<string, RuntimeIndex>;
    /**
     * Registers a new index from its plugin declaration object.
     *
     * Three outcomes (matches `combinePlugins`' strictness and adds one new
     * rule for cross-name duplicates):
     *
     * - Same `name` already registered with the *identity-equal* `decl`: no-op.
     *   This is the benign idempotent path through repeated `db.extend(plugin)`
     *   calls with the same plugin instance.
     * - Same `name` already registered with a different `decl` object (even
     *   if structurally equal): throws. Indexes must reuse the same reference
     *   across plugins — same rule as components / transactions.
     * - A different `name` is already registered with the same structural
     *   shape (`components` order-equal, `unique` flag-equal): throws. Almost
     *   always an unintentional duplicate; the error names both indexes so
     *   the author can collapse them to one declaration.
     */
    register(name: string, decl: IndexDeclarationObject): void;
    /** Apply a transaction's changes to every registered index. */
    apply(result: TransactionResult<any>): void;
    /** Drop all index entries and reseed from the current store contents. */
    rebuild(): void;
    /**
     * Reflect a single insert into every registered index. Throws on
     * unique-key collision (the caller must call
     * `checkUniqueAvailableForInsert` first to keep store + index
     * consistent under a partial mutation).
     */
    applyInsert(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    /**
     * Reflect a single update into every registered index. The caller must
     * have already mutated the store, so `read(entity)` returns the
     * post-update values.
     */
    applyUpdate(entity: Entity): void;
    /** Reflect a single delete into every registered index. */
    applyDelete(entity: Entity): void;
    /**
     * Check every unique index for a collision against `values`. Throws on
     * collision; returns silently if all unique indexes are available.
     * No-op for registries with zero unique indexes.
     */
    checkUniqueAvailableForInsert(values: Readonly<Record<string, unknown>>): void;
    /**
     * Like `checkUniqueAvailableForInsert` but ignores collisions with
     * `entity` itself (the row currently being updated). Computes the new
     * values as `{...currentValues, ...patch}` so unique checks see the
     * full effective key.
     */
    checkUniqueAvailableForUpdate(entity: Entity, patch: Readonly<Record<string, unknown>>): void;
}

const shapeKey = (decl: IndexDeclarationObject): string => {
    const unique = decl.unique ?? false;
    return `${unique}\x1f${decl.components.join("\x1f")}`;
};

const formatShape = (decl: IndexDeclarationObject): string =>
    `components=[${decl.components.join(",")}] unique=${decl.unique ?? false}`;

export const createIndexRegistry = (
    read: EntityReader,
    iterateEntities: EntityIterator,
): IndexRegistry => {
    const indexes = new Map<string, RuntimeIndex>();
    const entries = new Map<string, RegisteredEntry>();
    // Reverse lookup from structural shape → name so that the
    // "different-name same-shape" check is O(1).
    const shapeToName = new Map<string, string>();

    const seedIndex = (idx: RuntimeIndex): void => {
        for (const entity of iterateEntities()) {
            const values = read(entity);
            if (values !== null) idx.add(entity, values);
        }
    };

    const register = (name: string, decl: IndexDeclarationObject): void => {
        const existing = entries.get(name);
        if (existing) {
            if (existing.decl === decl) return; // identity match → benign re-register
            throw new Error(
                `Index "${name}" already registered with a different declaration object. ` +
                `Indexes must reuse the same declaration reference across plugins ` +
                `(combinePlugins enforces this; the same rule applies here). ` +
                `existing ${formatShape(existing.decl)}, new ${formatShape(decl)}`,
            );
        }

        const sk = shapeKey(decl);
        const dupName = shapeToName.get(sk);
        if (dupName !== undefined) {
            throw new Error(
                `Indexes "${dupName}" and "${name}" have identical shape ` +
                `(${formatShape(decl)}). Almost certainly an unintentional ` +
                `duplicate — collapse them to a single declaration that both ` +
                `plugins share.`,
            );
        }

        const state: IndexState = {
            components: decl.components,
            unique: decl.unique ?? false,
        };
        const idx = createIndex(state);
        indexes.set(name, idx);
        entries.set(name, { decl, index: idx });
        shapeToName.set(sk, name);
        // Populate from existing entities so a plugin registered after data is
        // loaded still sees the right index contents.
        seedIndex(idx);
    };

    const reflectEntity = (entity: Entity, change: unknown): void => {
        if (change === null) {
            for (const idx of indexes.values()) idx.remove(entity);
            return;
        }
        // For insert/update we re-read because the patch may not include every
        // indexed component (an update that changes only one of a compound
        // index's keys still needs the unchanged keys to compute the new key).
        const values = read(entity);
        if (values === null) {
            for (const idx of indexes.values()) idx.remove(entity);
            return;
        }
        for (const idx of indexes.values()) idx.update(entity, values);
    };

    const apply = (result: TransactionResult<any>): void => {
        if (indexes.size === 0) return;
        for (const [entity, change] of result.changedEntities) {
            reflectEntity(entity, change);
        }
    };

    const rebuild = (): void => {
        for (const idx of indexes.values()) idx.clear();
        for (const idx of indexes.values()) seedIndex(idx);
    };

    const applyInsert = (entity: Entity, values: Readonly<Record<string, unknown>>): void => {
        if (indexes.size === 0) return;
        for (const idx of indexes.values()) idx.add(entity, values);
    };

    const applyUpdate = (entity: Entity): void => {
        if (indexes.size === 0) return;
        const values = read(entity);
        if (values === null) {
            for (const idx of indexes.values()) idx.remove(entity);
            return;
        }
        for (const idx of indexes.values()) idx.update(entity, values);
    };

    const applyDelete = (entity: Entity): void => {
        if (indexes.size === 0) return;
        for (const idx of indexes.values()) idx.remove(entity);
    };

    const checkUniqueAvailableForInsert = (
        values: Readonly<Record<string, unknown>>,
    ): void => {
        for (const [name, idx] of indexes) {
            if (!idx.unique) continue;
            const collidesWith = idx.checkUniqueAvailable(values);
            if (collidesWith !== null) {
                throw new Error(
                    `Unique index conflict on "${name}" (components=[${idx.components.join(",")}]): ` +
                    `existing entity ${collidesWith}.`,
                );
            }
        }
    };

    const checkUniqueAvailableForUpdate = (
        entity: Entity,
        patch: Readonly<Record<string, unknown>>,
    ): void => {
        // Short-circuit when there are no unique indexes at all.
        let hasUnique = false;
        for (const idx of indexes.values()) { if (idx.unique) { hasUnique = true; break; } }
        if (!hasUnique) return;
        const current = read(entity);
        if (current === null) return; // entity already gone — caller will likely throw downstream
        // Compute effective new values for the unique-key computation.
        const effective: Record<string, unknown> = { ...current, ...patch };
        for (const [name, idx] of indexes) {
            if (!idx.unique) continue;
            const collidesWith = idx.checkUniqueAvailableForUpdate(entity, effective);
            if (collidesWith !== null) {
                throw new Error(
                    `Unique index conflict on "${name}" (components=[${idx.components.join(",")}]): ` +
                    `existing entity ${collidesWith} would collide with the update of entity ${entity}.`,
                );
            }
        }
    };

    return {
        indexes,
        register,
        apply,
        rebuild,
        applyInsert,
        applyUpdate,
        applyDelete,
        checkUniqueAvailableForInsert,
        checkUniqueAvailableForUpdate,
    };
};
