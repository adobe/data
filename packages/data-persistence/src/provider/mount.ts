// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import type { PersistenceMount, PersistenceProvider, ProviderMountOptions } from "./persistence-provider.js";

/**
 * Mount a persistence session using the supplied provider.
 *
 * This is the single entry point for all persistence. The provider
 * encapsulates the storage strategy — Node.js `fs`, OPFS, in-memory, or
 * a custom cloud implementation.
 *
 * ```ts
 * import { mount } from "@adobe/data-persistence";
 * import { createNodeFsProvider } from "@adobe/data-persistence/node";
 *
 * const m = await mount(createNodeFsProvider("/tmp/my-db"), database);
 * await m.service.load();
 * // ...run app...
 * await m.dispose();
 * ```
 */
export const mount = (
    provider: PersistenceProvider,
    database: Database<any, any, any, any, any, any, any, any>,
    options?: ProviderMountOptions,
): Promise<PersistenceMount> => provider.mount(database, options);
