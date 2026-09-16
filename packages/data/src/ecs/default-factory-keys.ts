// © 2026 Adobe. MIT License. See /LICENSE for details.
import { StringKeyof } from "../types/types.js";

/**
 * The component names whose schema declares a `defaultFactory` (see
 * Schema.defaultFactory). Derived from the raw component SCHEMAS (which still
 * carry the `defaultFactory` name — it is erased by `Schema.ToType`), so it can
 * be threaded alongside the value-typed component set to mark those components
 * OPTIONAL at insert (the archetype mints them when the row omits them). A union
 * of the matching keys, or `never` when no component names a factory.
 */
export type DefaultFactoryKeys<CS> = {
    [K in StringKeyof<CS>]: CS[K] extends { defaultFactory: string } ? K : never
}[StringKeyof<CS>];
