// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ComponentSchemas } from "../../component-schemas.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { Store } from "../store.js";
import { Schema } from "../../../schema/index.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { createCore } from "../core/create-core.js";
import { Entity } from "../../entity.js";
import { Core } from "../core/core.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { ArchetypeComponents } from "../archetype-components.js";
import { EntitySelectOptions } from "../entity-select-options.js";
import { selectEntities } from "../core/select-entities.js";
import { OptionalComponents } from "../../optional-components.js";

export function createStore<
    CS extends ComponentSchemas = {},
    RS extends ResourceSchemas = {},
    A extends ArchetypeComponents<StringKeyof<CS>> = {}
>(
    schema?: Store.Schema<CS, RS, A>,
): Store<FromSchemas<CS>, FromSchemas<RS>, A> {
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

    const core = createCore(componentAndResourceSchemas) as unknown as Core<C>;

    // Each resource will be stored as the only entity in an archetype of [id, <resourceName>]
    // The resource component we added above will contain the resource value
    const ensureResourceInitialized = (name: string, resourceSchema: Schema & { default: unknown }) => {
        const resourceId = name as StringKeyof<C>;
        const archetype = core.ensureArchetype(["id", resourceId]);
        if (archetype.rowCount === 0) {
            archetype.insert({ [resourceId]: resourceSchema.default } as any);
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

    const extend = (schema: Store.Schema<any, any, any>) => {
        const { components: schemaComponents = {}, resources: schemaResources = {}, archetypes: schemaArchetypes = {} } = schema;
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

        // archetypes: existing must be identical if present
        for (const [name, newComponents] of Object.entries(schemaArchetypes)) {
            if (name in archetypeComponentNames) {
                if (archetypeComponentNames[name as keyof typeof archetypeComponentNames] !== newComponents) {
                    throw new Error(`Archetype definition for "${name}" must be identical when extending.`);
                }
                continue;
            }
            archetypeComponentNames[name as keyof typeof archetypeComponentNames] = newComponents as any;
            const archetype = core.ensureArchetype(["id", ...(newComponents as any)]);
            (archetypes as any)[name] = archetype;
        }

        return store as any;
    }

    const store: Store<C, R> = {
        ...core,
        resources,
        select,
        archetypes,
        extend,
        toData: () => core.toData(),
        fromData: (data: unknown) => {
            core.fromData(data);
            for (const [name, resourceSchema] of Object.entries(resourceSchemas)) {
                ensureResourceInitialized(name, resourceSchema as any);
            }
        },
    };

    return store.extend(normalizedSchema) as any;
}
