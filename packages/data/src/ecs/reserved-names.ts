// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { IdComponent } from "./required-components.js";
import type { OptionalComponents } from "./optional-components.js";

/**
 * Rejects a component or resource map that uses a name reserved by the ECS (`id`,
 * `nonPersistent`, `nonShared`): each reserved key it holds must be `never`, so the
 * declaration fails to compile instead of throwing when the store is created.
 */
export type NoReservedNames<T> = { readonly [K in Extract<keyof T, IdComponent | keyof OptionalComponents>]: never };

/**
 * Rejects names in `T` that are already declared in `Other`: a component name can't
 * also be a resource name (and vice versa), because a resource is stored as a
 * same-named component column. The store also throws on a clash at runtime.
 */
export type NoNameClash<T, Other> = { readonly [K in Extract<keyof T, keyof Other>]: never };
