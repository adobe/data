// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import type { ArchetypeId } from "../../archetype/archetype.js";
import type { TransactionResult } from "../transactional-store/index.js";
import { createIndex, IndexKeyDecl, IndexOrderDecl, IndexState, RuntimeIndex } from "./create-index.js";

/**
 * The minimal archetype shape the registry needs to dispatch a mutation to
 * only the indexes that apply to it: a stable id (cache key) and the component
 * set. An index applies to an archetype iff the archetype's components are a
 * superset of the index's `readColumns` — which already folds in the
 * archetype-scope columns, so this single check covers scoping too.
 */
export type IndexableArchetype = {
    readonly id: ArchetypeId;
    readonly components: ReadonlySet<string>;
};

/**
 * Reads the post-transaction values of an entity, or returns null when the
 * entity does not exist. Supplied by `createStore` so the registry stays
 * decoupled from the store layer.
 */
export type EntityReader = (entity: Entity) => Readonly<Record<string, unknown>> | null;

/**
 * Plugin-level declaration object as it appears in `plugin.indexes[name]`.
 * The registry holds the *exact* reference so the same-name re-registration
 * check can compare identity (`===`) — matching the rule
 * `combinePlugins` already enforces for components / transactions / etc.
 *
 * Mirrors the public `Index` type from `store/index-types.ts` at the
 * value layer (the registry doesn't have access to the host component
 * map, so this version is loose-typed).
 */
export type IndexDeclarationObject = {
    readonly key: IndexKeyDecl;
    readonly order?: IndexOrderDecl;
    readonly unique?: boolean;
    readonly components?: readonly string[];
    /** Scope the index to a single archetype (by name). */
    readonly archetype?: string;
};

/**
 * Resolves an archetype name to its declared component set, so an
 * archetype-scoped index can restrict itself to entities carrying those
 * components. Supplied by `createStore`, which owns the archetype map.
 */
export type ArchetypeColumnsResolver = (archetype: string) => readonly string[] | undefined;

interface RegisteredEntry {
    readonly decl: IndexDeclarationObject;
    readonly index: RuntimeIndex;
}

export interface IndexRegistry {
    readonly indexes: ReadonlyMap<string, RuntimeIndex>;
    /**
     * Registers a new index from its plugin declaration object.
     *
     * - Same `name` with identity-equal `decl`: no-op (returns null).
     * - Same `name` with a different `decl` object: throws.
     * - Different `name` with structurally identical declaration: throws.
     *
     * Returns the new `RuntimeIndex` for the caller to seed from archetypes.
     */
    register(name: string, decl: IndexDeclarationObject): RuntimeIndex | null;
    /** Apply a transaction's changes to every registered index. */
    apply(result: TransactionResult<any>): void;
    /** Drop all bucket entries without reseeding. */
    clear(): void;
    /**
     * Reflect a single insert into the entity's archetype. Dispatches to only
     * the indexes applicable to that archetype — O(applicable), not O(indexes).
     */
    applyInsert(entity: Entity, archetype: IndexableArchetype, values: Readonly<Record<string, unknown>>): void;
    /**
     * Reflect a single update by re-reading the entity's full values. `from`
     * is the archetype before the update, `to` the archetype after (they
     * differ only when the update added/removed components); the union of
     * their applicable indexes is updated so an entity that changes archetype
     * is removed from indexes it left and added to those it entered.
     */
    applyUpdate(entity: Entity, from: IndexableArchetype | null, to: IndexableArchetype | null): void;
    /** Reflect a single delete from the entity's (pre-delete) archetype. */
    applyDelete(entity: Entity, archetype: IndexableArchetype | null): void;
    /** Throws if any unique index applicable to the insert archetype would collide. Call before mutating. */
    checkUniqueAvailableForInsert(archetype: IndexableArchetype, values: Readonly<Record<string, unknown>>): void;
    /** Like the insert version, but excludes self-collisions for `entity`. */
    checkUniqueAvailableForUpdate(entity: Entity, patch: Readonly<Record<string, unknown>>): void;
}

/**
 * Assigns a stable numeric id to each distinct function the registry sees
 * (used inside the structural-duplicate shape key). Two indexes with the
 * same key shape but different extractor functions are NOT duplicates.
 */
const fnIds = new WeakMap<Function, number>();
let nextFnId = 0;
const fnIdent = (fn: Function): string => {
    let id = fnIds.get(fn);
    if (id === undefined) {
        id = nextFnId++;
        fnIds.set(fn, id);
    }
    return `f${id}`;
};

const keyIdent = (key: IndexKeyDecl): string => {
    if (typeof key === "string") return `s:${key}`;
    if (Array.isArray(key)) return `t:${(key as readonly string[]).join("\x1f")}`;
    if (typeof key === "function") return `f:${fnIdent(key)}`;
    // Slot map — sort slot names for stable ordering.
    const slots = Object.entries(key as Record<string, string | Function>).sort();
    return "m:" + slots.map(([slot, v]) =>
        typeof v === "string" ? `${slot}=s:${v}` : `${slot}=${fnIdent(v as Function)}`,
    ).join("\x1f");
};

const orderIdent = (order: IndexOrderDecl | undefined): string => {
    if (!order) return "";
    const by = order.by.join("\x1f");
    const cmp = order.compare ? fnIdent(order.compare) : "default";
    return `${by}|${cmp}`;
};

const shapeKey = (decl: IndexDeclarationObject): string => [
    decl.unique ?? false,
    keyIdent(decl.key),
    orderIdent(decl.order),
].join("\x1f");

const formatShape = (decl: IndexDeclarationObject): string => {
    const unique = decl.unique ? " unique" : "";
    const order = decl.order ? ` order=[${decl.order.by.join(",")}]` : "";
    return `key=${keyIdent(decl.key)}${unique}${order}`;
};

export const createIndexRegistry = (
    read: EntityReader,
    archetypeColumns?: ArchetypeColumnsResolver,
): IndexRegistry => {
    const indexes = new Map<string, RuntimeIndex>();
    const entries = new Map<string, RegisteredEntry>();
    const shapeToName = new Map<string, string>();

    // archetype id -> indexes applicable to it (readColumns ⊆ components),
    // computed lazily on first mutation to an archetype and cached. Archetypes
    // are immutable, so an entry only goes stale when a new index registers —
    // we clear the whole cache there. This turns per-mutation index dispatch
    // from O(all indexes) into an O(1) lookup + O(applicable) walk.
    const applicableCache = new Map<ArchetypeId, RuntimeIndex[]>();
    const indexesFor = (archetype: IndexableArchetype): RuntimeIndex[] => {
        let list = applicableCache.get(archetype.id);
        if (list === undefined) {
            list = [];
            for (const idx of indexes.values()) {
                if (idx.readColumns.every((c) => archetype.components.has(c))) list.push(idx);
            }
            applicableCache.set(archetype.id, list);
        }
        return list;
    };

    const register = (name: string, decl: IndexDeclarationObject): RuntimeIndex | null => {
        const existing = entries.get(name);
        if (existing) {
            if (existing.decl === decl) return null;
            throw new Error(
                `Index "${name}" already registered with a different declaration object. ` +
                `Indexes must reuse the same declaration reference across plugins. ` +
                `existing ${formatShape(existing.decl)}, new ${formatShape(decl)}`,
            );
        }
        const sk = shapeKey(decl);
        const dupName = shapeToName.get(sk);
        if (dupName !== undefined) {
            throw new Error(
                `Indexes "${dupName}" and "${name}" have identical shape ` +
                `(${formatShape(decl)}). Almost certainly an unintentional ` +
                `duplicate — collapse them to a single declaration.`,
            );
        }
        let scopeColumns: readonly string[] | undefined;
        if (decl.archetype !== undefined) {
            scopeColumns = archetypeColumns?.(decl.archetype);
            if (scopeColumns === undefined) {
                throw new Error(
                    `Index "${name}" is scoped to unknown archetype "${decl.archetype}". ` +
                    `Declare the archetype before the index that scopes to it.`,
                );
            }
        }
        const state: IndexState = {
            key: decl.key,
            order: decl.order,
            unique: decl.unique ?? false,
            components: decl.components,
            scopeColumns,
        };
        const idx = createIndex(state);
        indexes.set(name, idx);
        entries.set(name, { decl, index: idx });
        shapeToName.set(sk, name);
        // A new index can apply to already-seen archetypes — drop the cache.
        applicableCache.clear();
        return idx;
    };

    const reflectEntity = (entity: Entity, change: unknown): void => {
        if (change === null) {
            for (const idx of indexes.values()) idx.remove(entity);
            return;
        }
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

    const clear = (): void => {
        for (const idx of indexes.values()) idx.clear();
    };

    // Names are needed for conflict messages; resolve lazily from the map.
    const nameOf = (index: RuntimeIndex): string => {
        for (const [name, idx] of indexes) if (idx === index) return name;
        return "<index>";
    };

    const applyInsert = (entity: Entity, archetype: IndexableArchetype, values: Readonly<Record<string, unknown>>): void => {
        if (indexes.size === 0) return;
        for (const idx of indexesFor(archetype)) idx.add(entity, values);
    };

    const applyUpdate = (entity: Entity, from: IndexableArchetype | null, to: IndexableArchetype | null): void => {
        if (indexes.size === 0) return;
        const values = read(entity);
        if (values === null) {
            // Entity gone — remove from everything it could have been in.
            for (const idx of from ? indexesFor(from) : indexes.values()) idx.remove(entity);
            return;
        }
        // Update the indexes of the destination archetype; when the update
        // changed archetype, also the source's, so the entity is dropped from
        // indexes it no longer belongs to. Each `idx.update` re-derives the
        // entity's buckets from `values`, so add / move / remove all fall out
        // of the same call.
        const toList = to ? indexesFor(to) : [];
        for (const idx of toList) idx.update(entity, values);
        if (from && (!to || from.id !== to.id)) {
            const seen = toList.length > 0 ? new Set(toList) : null;
            for (const idx of indexesFor(from)) {
                if (seen === null || !seen.has(idx)) idx.update(entity, values);
            }
        }
    };

    const applyDelete = (entity: Entity, archetype: IndexableArchetype | null): void => {
        if (indexes.size === 0) return;
        for (const idx of archetype ? indexesFor(archetype) : indexes.values()) idx.remove(entity);
    };

    const checkUniqueAvailableForInsert = (
        archetype: IndexableArchetype,
        values: Readonly<Record<string, unknown>>,
    ): void => {
        for (const idx of indexesFor(archetype)) {
            if (!idx.unique) continue;
            const collidesWith = idx.checkUniqueAvailable(values, null);
            if (collidesWith !== null) {
                throw new Error(
                    `Unique index conflict on "${nameOf(idx)}": existing entity ${collidesWith}.`,
                );
            }
        }
    };

    const checkUniqueAvailableForUpdate = (
        entity: Entity,
        patch: Readonly<Record<string, unknown>>,
    ): void => {
        const current = read(entity);
        if (current === null) return;
        const effective: Record<string, unknown> = { ...current, ...patch };
        for (const [name, idx] of indexes) {
            if (!idx.unique) continue;
            // Applicability gate (replaces the per-entity scope check inside
            // the index): only test indexes whose read columns the post-update
            // entity actually has, so a scoped unique index is never checked
            // against an entity outside its archetype.
            if (!idx.readColumns.every((c) => effective[c] !== undefined)) continue;
            const collidesWith = idx.checkUniqueAvailable(effective, entity);
            if (collidesWith !== null) {
                throw new Error(
                    `Unique index conflict on "${name}": existing entity ${collidesWith} ` +
                    `would collide with the update of entity ${entity}.`,
                );
            }
        }
    };

    return {
        indexes,
        register,
        apply,
        clear,
        applyInsert,
        applyUpdate,
        applyDelete,
        checkUniqueAvailableForInsert,
        checkUniqueAvailableForUpdate,
    };
};
