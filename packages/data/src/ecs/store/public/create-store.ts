// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ComponentSchemas } from "../../component-schemas.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { Store } from "../store.js";
import { Schema } from "../../../schema/index.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { createCore } from "../core/create-core.js";
import { Entity } from "../../entity/entity.js";
import { Core } from "../core/core.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { ArchetypeComponents } from "../archetype-components.js";
import { EntitySelectOptions } from "../entity-select-options.js";
import { selectEntities } from "../core/select-entities.js";
import { OptionalComponents } from "../../optional-components.js";
import {
    createIndexRegistry,
    IndexDeclarationObject,
    RuntimeIndex,
} from "../../database/index-registry/index.js";
import { PartitionKeysOf } from "../partition.js";

export function createStore<
    CS extends ComponentSchemas = {},
    RS extends ResourceSchemas = {},
    A extends ArchetypeComponents<StringKeyof<CS>> = {}
>(
    schema?: Store.Schema<CS, RS, A>,
): Store<FromSchemas<CS>, FromSchemas<RS>, A, {}, PartitionKeysOf<CS>> {
    const schemaArg = schema as any;
    const hasSchemaShape =
        schemaArg &&
        typeof schemaArg === "object" &&
        "components" in schemaArg &&
        "resources" in schemaArg &&
        "archetypes" in schemaArg;

    const normalizedSchema: Store.Schema<CS, RS, A> = hasSchemaShape
        ? schemaArg
        : {
            components: {} as CS,
            resources: {} as RS,
            archetypes: {} as A,
        };

    type C = RequiredComponents & { [K in StringKeyof<CS>]: Schema.ToType<CS[K]> };
    type R = { [K in StringKeyof<RS>]: Schema.ToType<RS[K]> };

    const resources = {} as R;
    const componentSchemas = {} as CS;
    const resourceSchemas = {} as RS;
    const archetypeComponentNames = {} as A;
    const componentAndResourceSchemas: { [K in StringKeyof<C | R>]: Schema } = {} as any;

    const core = createCore(
        componentAndResourceSchemas,
        (archetype) => decorateArchetypeForIndexes(archetype),
    ) as unknown as Core<C>;

    // Index registry. Owned at the Store layer because index state is
    // *derived* from store data, and every mutation that needs to keep
    // indexes in sync flows through Store methods (insert / update /
    // delete). Higher layers (`db.indexes`, `t.indexes`) expose this same
    // map by reference.
    //
    // The reader is only used for `applyUpdate` — the patch passed to
    // `store.update` may omit components an index covers, so the registry
    // re-reads the full record to recompute the key. Seeding goes through
    // `seedIndexFromArchetypes` instead (see below).
    const indexRegistry = createIndexRegistry(
        (entity) => {
            const values = core.read(entity);
            if (!values) return null;
            // Strip `id` — it is never a useful index key.
            const { id: _id, ...rest } = values as { id: Entity } & Record<string, unknown>;
            return rest;
        },
        // Resolve an `archetype`-scoped index to that archetype's declared
        // component set (archetypes are registered before indexes in `extend`).
        (archetypeName) => (archetypeComponentNames as Record<string, readonly string[]>)[archetypeName],
    );

    /**
     * Populate an index from the archetypes whose component set is a
     * superset of the index's `components`. Only those archetypes can
     * possibly contribute — entities in any other archetype lack at
     * least one of the indexed components, so they would never match
     * `find` / `findRange` / `get` anyway.
     *
     * For each candidate archetype, the values record is built directly
     * from the dense column buffers (no `store.read` / `locate`
     * indirection) and handed to `idx.add` once per row.
     */
    const seedIndexFromArchetypes = (idx: RuntimeIndex): void => {
        // `idx.readColumns` already includes both bucket-key columns and
        // sort columns (the RuntimeIndex unifies them at creation time).
        // `queryArchetypes` filters to only those archetypes carrying the
        // full set — entities in any other archetype lack at least one
        // component the index touches and would never produce a key.
        const required = idx.readColumns;
        if (required.length === 0) return;
        const archetypes = core.queryArchetypes(required as readonly StringKeyof<C>[]);
        for (const archetype of archetypes) {
            const idCol = archetype.columns.id;
            for (let row = 0; row < archetype.rowCount; row++) {
                const values: Record<string, unknown> = {};
                for (const c of required) {
                    values[c] = (archetype.columns as Record<string, { get(r: number): unknown }>)[c].get(row);
                }
                idx.add(idCol.get(row), values);
            }
        }
    };

    // Public handle map keyed by user-chosen name. Each entry exposes
    // find/findRange (always) and get (when the index is unique). Same
    // object reference flows up via spread to the Database layer.
    const indexHandles: Record<string, unknown> = {};

    const exposeIndexHandle = (name: string, idx: RuntimeIndex): void => {
        if (name in indexHandles) return;
        // Decide whether the auto-router can dispatch a raw-equality `where`
        // clause to this index. Routable iff the key declaration is a pure
        // column reference (bare string) or column tuple (string array) —
        // function keys derive a value from inputs (live in a different value
        // space than the source columns) and slot maps name parts arbitrarily
        // (`{ team: "team", role: ... }`), so the planner cannot infer the
        // column set from a where clause alone for either.
        const key = idx.key;
        let routableColumns: readonly string[] | null;
        if (typeof key === "string") {
            routableColumns = [key];
        } else if (Array.isArray(key)) {
            routableColumns = key as readonly string[];
        } else {
            routableColumns = null;
        }
        // Sort columns the auto-router can serve an *ascending* `order` clause
        // from. Only a sorted index using the default comparator qualifies: a
        // custom `compare` encodes an ordering the planner can't match against
        // a plain `{ col: ascending }` select clause, so it opts out (null).
        const routableOrder: readonly string[] | null =
            idx.order && !idx.order.compare ? idx.order.by : null;
        const handle: Record<string, unknown> = {
            find: idx.find,
            findRange: idx.findRange,
            // Internal planner-only field. Not part of the public
            // `Database.Index.Handle` type. `routableColumns: null` opts the
            // index out of raw-where auto-routing (function/slot-map keys).
            // The planner reads this to pick a matching index and then
            // calls `handle.find` (so user-installed spies on the handle
            // intercept the routed call).
            routableColumns,
            // Internal planner-only field. The ascending sort columns this
            // index can serve, or null when it can't (unsorted, or custom
            // comparator). The auto-router reads this to route an ordered
            // `select` / `observe.select` through the (already-sorted) index.
            routableOrder,
            // Internal field consumed by the Database layer to build the
            // reactive `handle.observe`: the columns (key + sort) whose change
            // can alter this bucket's contents or order. The handle's public
            // `observe` is attached at the Database layer because it must fire
            // on the transaction-commit boundary, which only exists there.
            readColumns: idx.readColumns,
        };
        if (idx.unique) handle.get = idx.get;
        indexHandles[name] = handle;
    };

    // Each resource will be stored as the only entity in an archetype of [id, <resourceName>]
    // The resource component we added above will contain the resource value
    const ensureResourceInitialized = (name: string, resourceSchema: Schema & { default: unknown }) => {
        const resourceId = name as StringKeyof<C>;
        const isNonPersistent = resourceSchema.nonPersistent;
        const componentNames: StringKeyof<C>[] = isNonPersistent
            ? ["id" as StringKeyof<C>, resourceId, "nonPersistent" as StringKeyof<C>]
            : ["id" as StringKeyof<C>, resourceId];
        const archetype = core.ensureArchetype(componentNames);
        if (archetype.rowCount === 0) {
            const insertValues = isNonPersistent
                ? { [resourceId]: resourceSchema.default, nonPersistent: true }
                : { [resourceId]: resourceSchema.default };
            // Resource singleton inserts bypass index pre-check because
            // resources are not typically indexed by their schema name and
            // the singleton row is created exactly once.
            archetype.insert(insertValues as any);
        }
        if (!Object.prototype.hasOwnProperty.call(resources, name)) {
            const row = 0;
            Object.defineProperty(resources, name, {
                get: () => archetype.columns[resourceId]!.get(row),
                set: (value) => {
                    archetype.columns[resourceId]!.set(row, value);
                },
                enumerable: true,
                configurable: true,
            });
        }
    };

    const select = <
        Include extends StringKeyof<C & OptionalComponents>
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C & OptionalComponents, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ): readonly Entity[] => {
        return selectEntities<C, Include>(core, include, options);
    }

    const archetypes = {} as any;

    // Decorate an archetype's `insert` in place with index maintenance. The core
    // calls this (via `onArchetypeCreated`) the moment any archetype is created —
    // direct or a lazily-created partition value-child — so every write path
    // (direct insert, router routing, migration target) shares one maintained
    // insert. No Proxy and no forwarding wrapper: the archetype you hold *is* the
    // index-maintaining one, and `===` identity is preserved for free.
    const decorateArchetypeForIndexes = (archetype: any): void => {
        const rawInsert = archetype.insert.bind(archetype);
        archetype.insert = (values: any): Entity => {
            // Pre-check unique constraints before the column mutation so a
            // collision throws without partially mutating the store. The
            // archetype's id + component set let the registry dispatch to only
            // the applicable indexes.
            indexRegistry.checkUniqueAvailableForInsert(archetype, values);
            const entity = rawInsert(values);
            indexRegistry.applyInsert(entity, archetype, values);
            return entity;
        };
    };

    const updateEntity = (entity: Entity, values: any) => {
        indexRegistry.checkUniqueAvailableForUpdate(entity, values);
        // `update` can move the entity to a different archetype (when it
        // adds/removes components), so capture both ends for dispatch.
        const from = core.locate(entity)?.archetype ?? null;
        core.update(entity, values);
        const to = core.locate(entity)?.archetype ?? null;
        indexRegistry.applyUpdate(entity, from, to);
    };

    const deleteEntity = (entity: Entity) => {
        const archetype = core.locate(entity)?.archetype ?? null;
        core.delete(entity);
        indexRegistry.applyDelete(entity, archetype);
    };

    const extend = (schema: Store.Schema<any, any, any>) => {
        const {
            components: schemaComponents = {},
            resources: schemaResources = {},
            archetypes: schemaArchetypes = {},
            indexes: schemaIndexes = {},
        } = schema;
        // components: existing must be identical if present
        for (const [name, newComponentSchema] of Object.entries(schemaComponents)) {
            if (name in componentAndResourceSchemas) {
                if (componentAndResourceSchemas[name as keyof typeof componentAndResourceSchemas] !== newComponentSchema) {
                    throw new Error(`Component schema for "${name}" must be identical when extending.`);
                }
                continue;
            }
            componentAndResourceSchemas[name as keyof typeof componentAndResourceSchemas] = newComponentSchema as Schema;
            (core.componentSchemas as any)[name] = newComponentSchema as Schema;
            (componentSchemas as any)[name] = newComponentSchema;
        }

        // resources: existing must be identical if present
        const newResourceNames: string[] = [];
        for (const [name, newResourceSchema] of Object.entries(schemaResources)) {
            if (name in resourceSchemas) {
                if (resourceSchemas[name as keyof typeof resourceSchemas] !== newResourceSchema) {
                    throw new Error(`Resource schema for "${name}" must be identical when extending.`);
                }
                continue;
            }
            resourceSchemas[name as keyof typeof resourceSchemas] = newResourceSchema as any;
            componentAndResourceSchemas[name as keyof typeof componentAndResourceSchemas] = newResourceSchema as Schema;
            (core.componentSchemas as any)[name] = newResourceSchema as Schema;
            newResourceNames.push(name);
            ensureResourceInitialized(name, newResourceSchema as any);
        }

        // archetypes: existing must be identical if present.
        // Wrap each archetype with index maintenance hooks at exposure time.
        for (const [name, newComponents] of Object.entries(schemaArchetypes)) {
            if (name in archetypeComponentNames) {
                if (archetypeComponentNames[name as keyof typeof archetypeComponentNames] !== newComponents) {
                    throw new Error(`Archetype definition for "${name}" must be identical when extending.`);
                }
                continue;
            }
            archetypeComponentNames[name as keyof typeof archetypeComponentNames] = newComponents as any;
            // Insert is already index-maintaining (decorated at creation), and a
            // partitioned archetype resolves to a Router — both surfaced directly.
            (archetypes as any)[name] = core.ensureArchetype(["id", ...(newComponents as any)]);
        }

        // indexes: registry enforces (===)-or-throw on same name and
        // structural duplicate detection across names. A new RuntimeIndex
        // is returned when registration actually happened (vs. a benign
        // identity-match re-register), in which case we seed it from the
        // archetypes that contain its component set — and only those.
        const declaredIndexes = schemaIndexes as Record<string, IndexDeclarationObject>;
        for (const name in declaredIndexes) {
            const newIdx = indexRegistry.register(name, declaredIndexes[name]);
            if (newIdx) {
                exposeIndexHandle(name, newIdx);
                seedIndexFromArchetypes(newIdx);
            }
        }

        return store as any;
    }

    const store: Store<C, R> = {
        // `ensureArchetype` / `queryArchetypes` / `locate` come straight from
        // `core`: inserts are decorated at creation, so no Store-layer wrapping
        // is needed and `===` identity holds (the raw archetype is the handle).
        ...core,
        update: updateEntity,
        delete: deleteEntity,
        resources,
        select,
        archetypes,
        indexes: indexHandles as any,
        extend,
        reset: () => {
            core.reset();
            for (const [name, resourceSchema] of Object.entries(resourceSchemas)) {
                ensureResourceInitialized(name, resourceSchema as any);
            }
            // After reset, every index bucket is wiped. Resources are the
            // only entities that exist post-reset; seed each index from
            // archetypes so resource singletons whose components an index
            // happens to cover still appear.
            indexRegistry.clear();
            for (const idx of indexRegistry.indexes.values()) {
                seedIndexFromArchetypes(idx);
            }
        },
        toData: (copy = false) => core.toData(copy),
        fromData: (data: unknown) => {
            core.fromData(data);
            for (const [name, resourceSchema] of Object.entries(resourceSchemas)) {
                ensureResourceInitialized(name, resourceSchema as any);
            }
            // The loaded core has all entities; re-derive each index by
            // walking only the archetypes that contain its components.
            indexRegistry.clear();
            for (const idx of indexRegistry.indexes.values()) {
                seedIndexFromArchetypes(idx);
            }
        },
    };

    return store.extend(normalizedSchema) as any;
}
