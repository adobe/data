// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../index.js";
import { Schema } from "../../schema/index.js";
import { Simplify } from "../../types/types.js";
import { CoreComponents, ECSJSON, Table } from "../core-ecs/core-ecs-types.js";
import {
  EntityCreateValues,
  Entity,
  EntityValues,
  EntityUpdateValues,
} from "../core-ecs/core-ecs-types.js";

export type ECSComponents = CoreComponents;

/**
 * Represents a runtime handle to an ECS Archetype.
 * An archetype represents a set of components that are required to be present on an entity.
 * These instances cannot be created directly or persisted but are returned from the ECS API.
 */
export interface Archetype<EntityType = any> {
  readonly components: readonly (keyof EntityType)[];
}

export type ECSResources = {};

export type TypeFromComponents<
  C extends ECSComponents,
  T extends (keyof C)[],
> = { [K in T[number]]: C[K] };

export type ECSArchetypes = {};

/**
 * Comparison operators for declarative where clauses
 */
type ComparisonOperator = "==" | "!=" | "<" | ">" | ">=" | "<=";

/**
 * Represents a comparison operation in a declarative where clause
 */
type ComparisonOperation<T> = {
  [P in ComparisonOperator]?: T;
};

/**
 * Represents a condition that can be either a direct value, comparison operation, or nested conditions
 */
type WhereCondition<T> = T extends object
  ? { [K in keyof T]?: WhereCondition<T[K]> } | ComparisonOperation<T>
  : T | ComparisonOperation<T>;

/**
 * Declarative where clause structure that allows for JSON-based filtering
 * Each key in the object represents a component field to filter on
 * The value can either be a direct value (equality check), a comparison operation, or nested conditions
 */
export type WhereClause<T extends CoreComponents> = {
  [K in keyof T]?: WhereCondition<T[K]>;
};

type SelectOrder<T extends CoreComponents> = { [K in keyof T]?: boolean };
export type SelectOptions<C extends CoreComponents, T extends CoreComponents> = {
  /**
   * Order results by the given components ascending or descending.
   */
  order?: SelectOrder<T>;
  /**
   * Components to include in the results.
   */
  components?: (keyof T)[];
  /**
   * Do not return any rows for entities that contain these components.
   */
  without?: (keyof C)[];
  /**
   * Filter the results by the given condition using a declarative where clause.
   */
  where?: WhereClause<T>;
}

/**
 * An Entity Component System (ECS) is a data structure that stores entities and their components.
 * This interface is used for low level ECS instances that allow fast, direct read and write access.
 */
export interface ECS<
  C extends ECSComponents = ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes = ECSArchetypes, //  name => Archetype
  R extends ECSResources = ECSResources, //  name => Resource Value Type
> extends ECSWrite<C> {
  components: { readonly [K in keyof C]: Schema };
  archetypes: A;
  resources: { -readonly [K in keyof R]: R[K] };

  withComponents<
    S extends { [K: string]: Schema },
    T = { [K in keyof S]: Schema.ToType<S[K]> },
  >(
    components: S
  ): ECS<Simplify<C & T>, A, R>;
  withArchetypes<S extends { [K: string]: ReadonlyArray<keyof C> }>(
    archetypes: S
  ): ECS<
    C,
    Simplify<A & { -readonly [AN in keyof S]: Archetype<{ [PN in S[AN][number]]: C[PN] }> }>,
    R
  >;
  withResources<S extends { readonly [K: string]: Schema & { default: any } }> (
      resources: S
  ): ECS<
    C,
    A,
    Simplify<R & { -readonly [K in keyof S]: Schema.ToType<S[K]>}>
  >;
  withResources<S extends { [K: string]: Data }>(
    resources: S
  ): ECS<C, A, Simplify<R & S>>;

  getComponentValue<Name extends keyof C>(
    id: Entity,
    component: Name
  ): C[Name] | undefined;
  getArchetype<AC extends (keyof C)[]>(
    ...components: AC
  ): Archetype<TypeFromComponents<C, AC>>;
  getEntityArchetype(id: Entity): Archetype;
  /**
   * @returns
   *  The entity values if this entity contains all of the archetype components.
   *  Null if the entity exists but does not contain all of the archetype components.
   *  Undefined if the entity does not exist.
   */
  getEntityValues<A>(id: Entity, archetype: Archetype<A>): A & Partial<EntityValues<C>> | null | undefined;
  /**
   * @returns The entity values if this entity exists otherwise undefined.
   */
  getEntityValues(id: Entity): EntityValues<C> | undefined;

  countEntities<T extends CoreComponents>(archetype: Archetype<T>): number;
  selectEntities<T extends CoreComponents, P extends Partial<T>>(archetype: Archetype<T>, options?: Omit<SelectOptions<C, T>, "components">): Entity[];
  getTables(): Table[];
  getTables<T>(
    archetype: Archetype<T>,
    options: { mode: "read" | "write"; exact?: boolean }
  ): Table<T>[];

  selectEntityValues<T extends CoreComponents, P extends Partial<T>>(archetype: Archetype<T>, options: SelectOptions<C, T>): P[];
  selectEntityValues<T extends CoreComponents>(archetype: Archetype<T>): Simplify<T & EntityValues<C>>[];

  createBatch<T>(archetype: Archetype<T>, count: number): Table<T>;

  toJSON(): ECSJSON;
}

export interface ECSWrite<
  C extends ECSComponents, //  name => Component Value Type
> {
  /**
   * Sets the value of a component for the given entity.
   * @param component the component to write.
   * @param value the value of the component or undefined to delete the component.
   * @param id if not provided, uses the components own entity id as with resources.
   */
  setComponentValue<Name extends keyof C>(
    id: Entity,
    component: Name,
    value: C[Name] | undefined
  ): void;
  createEntity(): Entity;
  createEntity<T>(
    archetype: Archetype<T>,
    values: EntityCreateValues<T>
  ): Entity;
  updateEntity(id: Entity, values: EntityUpdateValues<C>): void;
  deleteEntity(id: Entity): void;
}
