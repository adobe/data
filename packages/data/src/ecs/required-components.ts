// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity } from "./entity/entity.js";

/**
 * The reserved component name for an entity's identity — the single source of
 * truth for the name. Every archetype carries this column; it is the entity's
 * key, never a component value. All ECS access to the identity column goes
 * through this constant (runtime) and {@link IdComponent} (type), so the name
 * could be changed here in one place (e.g. to `"entity"`) and the whole ECS
 * would follow.
 */
export const ID = "id" as const;

/** The identity component's name as a type — mirrors {@link ID}. */
export type IdComponent = typeof ID;

/** The always-present identity column every entity row is keyed by. */
export type RequiredComponents = Record<IdComponent, Entity>;

/**
 * Component names reserved by the ECS. User schemas may not define these — the
 * store/core throw if a schema does. `id` is the entity identity; `nonPersistent`
 * / `nonShared` are the built-in quadrant markers (see entity/persistence-sharing).
 */
export const RESERVED_COMPONENT_NAMES: readonly string[] = [ID, "nonPersistent", "nonShared"];
