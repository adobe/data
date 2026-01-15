// © 2026 Adobe. MIT License. See /LICENSE for details.
import { MemoryAllocator } from "../../cache/memory-allocator.js";
import { Data } from "../../index.js";
import { Schema } from "../../schema/index.js";
import { whereClauseToPredicate } from "./ecs-where-functions.js";
import {
  CoreArchetype,
  CoreComponents,
  CoreECS,
  ECSJSON,
  Entity,
  EntityValues,
} from "../core-ecs/core-ecs-types.js";
import { createCoreECS } from "../core-ecs/core-ecs.js";
import {
  Archetype,
  ECS,
  ECSArchetypes,
  ECSComponents,
  ECSResources,
  SelectOptions,
} from "./ecs-types.js";

function includesAny(array: any[], values: any[]): boolean {
  for (const value of values) {
    if (array.includes(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a new low level ECS.
 * This can be used for high performance applications but
 * for most cases the createActionECS is a better choice.
 * @param json a value previously returned from calling toJSON.
 */
export function createECS<
  C extends ECSComponents = ECSComponents,
  A extends ECSArchetypes = ECSArchetypes,
  R extends ECSResources = ECSResources,
>(options?: { allocator?: MemoryAllocator; data?: ECSJSON }): ECS<C, A, R> {
  const core = createCoreECS(options) as CoreECS<C, R>;

  const archetypes = {} as A;

  function getEntityValues<K extends keyof A>(
    id: Entity,
    archetype: Archetype<K>
  ): A[K] & Partial<EntityValues<C>> | null | undefined;
  function getEntityValues(id: Entity): EntityValues<C> | undefined;
  function getEntityValues<K extends keyof A>(
    id: Entity,
    archetype?: Archetype<K>
  ): A[K] & Partial<EntityValues<C>> | EntityValues<C> | null | undefined {
    const entityValues = core.getEntityValues(id) as
      | EntityValues<C>
      | undefined;
    if (entityValues && archetype) {
      for (const name of archetype.components) {
        if (
          entityValues[name as unknown as keyof CoreComponents] === undefined
        ) {
          return null;
        }
      }
    }
    return entityValues;
  }

  /**
   * Collects entities from tables based on the provided options
   * This is a shared function used by both selectEntityValuesWithoutCache and selectEntityValues
   */
  function collectEntitiesFromTables<T extends CoreComponents>(
    archetype: Archetype<T>,
    options?: SelectOptions<C, T>
  ): (T & EntityValues<C>)[] {
    const entities: any[] = [];

    const tables = core.getTables(archetype as any, { mode: "read" });
    for (const table of tables) {
      const size = table.rows;
      const columns = table.columns;

      // Skip tables with no rows or if they contain excluded components
      if (size === 0 || (options?.without && includesAny(options.without, Object.keys(columns)))) {
        continue;
      }
      const start = entities.length;
      //  first push empty objects
      for (let i = 0; i < size; i++) {
        entities.push({});
      }
      //  then iterate each column and set the values
      for (const [name, column] of Object.entries(columns)) {
        // Determine if this column is needed
        const neededForWhere = options?.where;
        const neededForOutput = !options?.components || options.components.includes(name as keyof T);
        const neededForOrder = options?.order && name in options.order;

        if (!neededForWhere && !neededForOutput && !neededForOrder && name !== 'id') {
          continue;
        }

        const { native, constant } = column;
        if (constant) {
          const value = column.get(0);
          for (let i = 0; i < size; i++) {
            entities[start + i][name] = value;
          }
        } else if (native) {
          for (let i = 0; i < size; i++) {
            entities[start + i][name] = native[i];
          }
        } else {
          for (let i = 0; i < size; i++) {
            entities[start + i][name] = column.get(i);
          }
        }
      }
    }

    return entities;
  }

  // Select entity values without using cache (internal use)
  function selectEntityValuesWithoutCache<T extends CoreComponents>(
    archetype: Archetype<T>
  ): (T & EntityValues<C>)[] {
    return collectEntitiesFromTables(archetype);
  }

  const selectEntityValues = <T extends CoreComponents, P extends Partial<T>>(
    archetype: Archetype<T>,
    options?: SelectOptions<C, T>
  ): (T & EntityValues<C>)[] => {
    // Fast path: if no options are provided, just return all entities
    if (!options) {
      return collectEntitiesFromTables(archetype);
    }

    // Collect entities with the appropriate filtering options
    let entities = collectEntitiesFromTables(archetype, options);

    // Apply where filter if provided (without caching)
    if (options?.where) {
      const predicate = whereClauseToPredicate(options.where);
      entities = entities.filter(entity => predicate(entity as unknown as EntityValues<T>));
    }

    // Apply ordering if provided
    if (options?.order) {
      entities.sort((a: any, b: any) => {
        for (const name in options.order!) {
          const direction = options.order[name] ? 1 : -1;
          if (a[name] < b[name]) {
            return -direction;
          }
          if (a[name] > b[name]) {
            return direction;
          }
        }
        return 0;
      });
    }

    // Apply component filtering last, after where and ordering
    if (options.components) {
      const components = options.components;
      entities = entities.map(entity => {
        const filteredEntity: any = {};
        for (const component of components) {
          filteredEntity[component] = entity[component];
        }
        return filteredEntity;
      });
    }

    return entities;
  };

  const selectEntities = <C extends CoreComponents, T extends CoreComponents>(
    archetype: Archetype<T> & CoreArchetype<CoreComponents>,
    options?: SelectOptions<C, T>
  ) => {
    // Fast path: if no filtering options are provided, use core implementation
    if (!options?.where && !options?.order && !options?.without) {
      return core.selectEntities(archetype as unknown as CoreArchetype);
    }

    // For all other cases, use selectEntityValues and extract IDs
    const entityValues = selectEntityValues(archetype, { ...options, components: ["id", ...Object.keys(options?.order ?? {})] } as any);
    return entityValues.map((entity: any) => entity.id);
  };

  const ecs: ECS<C, A, R> = {
    components: core.components,
    archetypes,
    resources: core.resources,
    withComponents: <
      S extends { [K: string]: Schema },
      T = { [K in keyof S]: Schema.ToType<S[K]> },
    >(
      newComponents: S
    ): any => {
      core.withComponents(newComponents);
      return ecs as any;
    },
    withArchetypes: <S extends { [K: string]: ReadonlyArray<keyof C> }>(
      newArchetypes: S
    ) => {
      for (const key in newArchetypes) {
        (archetypes as any)[key] = core.getArchetype(...newArchetypes[key]);
      }
      return ecs as any;
    },
    withResources: <S extends { [K: string]: Data }>(newResources: S): any => {
      core.withResources(newResources);
      return ecs as any;
    },
    setComponentValue: (id: Entity, component: any, value: any) => {
      // Update the component value
      core.setComponentValue(id, component, value);
    },
    getComponentValue: core.getComponentValue as ECS<
      C,
      A,
      R
    >["getComponentValue"],
    getArchetype: core.getArchetype as ECS<C, A, R>["getArchetype"],
    getEntityArchetype: core.getEntityArchetype as ECS<
      C,
      A,
      R
    >["getEntityArchetype"],
    getEntityValues,

    createBatch: core.createBatch as any,
    createEntity: core.createEntity,
    updateEntity: (id: Entity, values: any) => {
      // Update the entity
      core.updateEntity(id, values);
    },
    deleteEntity: (id: Entity) => {
      // Delete the entity
      core.deleteEntity(id);
    },

    countEntities: core.countEntities,
    selectEntities,
    getTables: core.getTables as ECS<C, A, R>["getTables"],
    selectEntityValues,
    toJSON: core.toJSON,
  };

  return ecs;
}
