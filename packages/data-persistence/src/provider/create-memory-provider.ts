// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import { createMemoryBackend } from "../backend/memory-backend.js";
import { createInprocessTransport } from "../transport/inprocess-transport.js";
import { createIncrementalPersistenceService } from "../service/create-incremental-persistence-service.js";
import type { PersistenceMount, PersistenceProvider, ProviderMountOptions } from "./persistence-provider.js";

/**
 * Creates an in-memory persistence provider. All data is lost when the
 * mount is disposed.
 *
 * Primarily useful for tests and for prototyping without configuring a
 * real storage backend.
 *
 * ```ts
 * import { mount } from "@adobe/data-persistence";
 * import { createMemoryProvider } from "@adobe/data-persistence";
 *
 * const m = await mount(createMemoryProvider(), database);
 * ```
 */
export const createMemoryProvider = (): PersistenceProvider => {
    // A single backend shared across all mounts from this provider instance,
    // so that a second mount can load data written by a previous mount.
    const backend = createMemoryBackend();

    return {
    providerName: "MemoryProvider",

    async mount(
        database: Database<any, any, any, any, any, any, any, any>,
        mountOptions?: ProviderMountOptions,
    ): Promise<PersistenceMount> {
        const transport = createInprocessTransport(backend);
        const service = await createIncrementalPersistenceService({
            database,
            backend,
            transport,
            autoPersist: mountOptions?.autoPersist,
            checkpoint: mountOptions?.checkpoint,
        });

        return {
            service,
            async dispose() {
                await service.dispose();
                await transport.close();
            },
        };
    },
    };
};
