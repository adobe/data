// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Simplify, StringKeyof } from "../../types/types.js";
import type { Database } from "./database.js";

// Helper to intersect all elements (works with mapped types over tuples)
type IntersectAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H & IntersectAll<R> : unknown
>;
type UnionAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H | UnionAll<R> : never
>;

// Array-based combination type - combines plugins from an array into a flat Database.Plugin.
// Uses direct property access (P['components']) instead of conditional inference
// (P extends Plugin<infer C, ...> ? C : never) to avoid expensive 8-way type expansion
// that amplifies TS7056 serialization overflow in deep extends chains.
export type CombinePlugins<Plugins extends readonly Database.Plugin[]> = Database.Plugin<
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['components'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['resources'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['archetypes'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['transactions'] }>,
  Extract<
    UnionAll<{ [K in keyof Plugins]: StringKeyof<Plugins[K]['systems']> }>,
    string
  >,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['actions'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['services'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['computed'] }>
>;


/**
 * Combines multiple plugins into a single plugin.
 * All plugin properties (components, resources, archetypes, computed, transactions, systems, actions, services)
 * require identity (===) when the same key exists across plugins.
 * 
 * IMPORTANT: Services are merged in order, preserving the initialization order
 * so that extended plugin services are initialized before current plugin services.
 */
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(...plugins: Plugins): Database.Plugin<
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['components'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['resources'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['archetypes'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['transactions'] }>,
  Extract<UnionAll<{ [K in keyof Plugins]: StringKeyof<Plugins[K]['systems']> }>, string>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['actions'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['services'] }>,
  {} & IntersectAll<{ [K in keyof Plugins]: Plugins[K]['computed'] }>
> {
  const keys = ['services', 'components', 'resources', 'archetypes', 'computed', 'transactions', 'actions', 'systems'] as const;

  const merge = (base: any, next: any) =>
    Object.fromEntries(keys.map(key => {
      const baseObj = base[key] ?? {};
      const nextObj = next[key] ?? {};

      // All keys require identity (===) check
      const merged = { ...baseObj };
      for (const [k, v] of Object.entries(nextObj)) {
        if (k in baseObj && baseObj[k] !== v) {
          throw new Error(
            `Plugin combine conflict: ${key}.${k} must be identical (===) across plugins`
          );
        }
        merged[k] = v;
      }
      return [key, merged];
    }));

  const emptyPlugin = { components: {}, resources: {}, archetypes: {}, computed: {}, transactions: {}, actions: {}, systems: {}, services: {} };

  // Merge all plugins together
  const result = plugins.reduce(merge, emptyPlugin);

  return result as CombinePlugins<Plugins>;
}

