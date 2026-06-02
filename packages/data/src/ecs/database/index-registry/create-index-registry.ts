// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "../../entity/entity.js";
import type { TransactionResult } from "../transactional-store/index.js";
import { createIndex, IndexKeyDecl, IndexOrderDecl, IndexState, RuntimeIndex } from "./create-index.js";

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
};

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
    /** Reflect a single insert. Throws on unique conflict — pre-check first. */
    applyInsert(entity: Entity, values: Readonly<Record<string, unknown>>): void;
    /** Reflect a single update by re-reading the entity's full values. */
    applyUpdate(entity: Entity): void;
    /** Reflect a single delete. */
    applyDelete(entity: Entity): void;
    /** Throws if any unique index would collide. Call before mutating. */
    checkUniqueAvailableForInsert(values: Readonly<Record<string, unknown>>): void;
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

export const createIndexRegistry = (read: EntityReader): IndexRegistry => {
    const indexes = new Map<string, RuntimeIndex>();
    const entries = new Map<string, RegisteredEntry>();
    const shapeToName = new Map<string, string>();

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
        const state: IndexState = {
            key: decl.key,
            order: decl.order,
            unique: decl.unique ?? false,
            components: decl.components,
        };
        const idx = createIndex(state);
        indexes.set(name, idx);
        entries.set(name, { decl, index: idx });
        shapeToName.set(sk, name);
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
            const collidesWith = idx.checkUniqueAvailable(values, null);
            if (collidesWith !== null) {
                throw new Error(
                    `Unique index conflict on "${name}": existing entity ${collidesWith}.`,
                );
            }
        }
    };

    const checkUniqueAvailableForUpdate = (
        entity: Entity,
        patch: Readonly<Record<string, unknown>>,
    ): void => {
        let hasUnique = false;
        for (const idx of indexes.values()) { if (idx.unique) { hasUnique = true; break; } }
        if (!hasUnique) return;
        const current = read(entity);
        if (current === null) return;
        const effective: Record<string, unknown> = { ...current, ...patch };
        for (const [name, idx] of indexes) {
            if (!idx.unique) continue;
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
