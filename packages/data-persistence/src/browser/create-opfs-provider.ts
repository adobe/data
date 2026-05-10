// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "@adobe/data/ecs";
import { createIncrementalPersistenceService } from "../service/create-incremental-persistence-service.js";
import type { PersistenceMount, PersistenceProvider, ProviderMountOptions } from "../provider/persistence-provider.js";
import { createBrowserWorkerTransport } from "./browser-worker-transport.js";
import { createOpfsBackend } from "./opfs-backend.js";

/**
 * Creates a browser persistence provider backed by the Origin Private
 * File System (OPFS). Always uses a dedicated `Worker` because
 * `FileSystemSyncAccessHandle` requires a worker context.
 *
 * ```ts
 * import { mount } from "@adobe/data-persistence";
 * import { createOpfsProvider } from "@adobe/data-persistence/browser";
 *
 * const m = await mount(createOpfsProvider(), database);
 * await m.service.load();
 * // ...run app...
 * await m.dispose();
 * ```
 *
 * Pass an explicit `FileSystemDirectoryHandle` to use a subdirectory
 * instead of the per-origin OPFS root.
 *
 * Must be called from the main thread or a shared worker — NOT from
 * inside a dedicated worker.
 */
export const createOpfsProvider = (
    root?: FileSystemDirectoryHandle,
): PersistenceProvider => ({
    providerName: "OpfsProvider",

    async mount(
        database: Database<any, any, any, any, any, any, any, any>,
        mountOptions?: ProviderMountOptions,
    ): Promise<PersistenceMount> {
        const resolvedRoot = root ?? await navigator.storage.getDirectory();

        const worker = new Worker(
            new URL("./browser-worker-bootstrap.js", import.meta.url),
            { type: "module" },
        );

        const transport = createBrowserWorkerTransport({ worker });
        const backend = await createOpfsBackend(resolvedRoot);
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
});
