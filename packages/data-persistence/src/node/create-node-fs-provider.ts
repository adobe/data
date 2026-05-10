// © 2026 Adobe. MIT License. See /LICENSE for details.

import { promises as fs } from "node:fs";
import type { Database } from "@adobe/data/ecs";
import { createInprocessTransport } from "../transport/inprocess-transport.js";
import { createIncrementalPersistenceService } from "../service/create-incremental-persistence-service.js";
import type { PersistenceMount, PersistenceProvider, ProviderMountOptions } from "../provider/persistence-provider.js";
import { createNodeFsBackend } from "./node-fs-backend.js";
import { createNodeWorkerTransport } from "./node-worker-transport.js";

export interface NodeFsProviderOptions {
    /**
     * When `true`, delegates all storage I/O to a `node:worker_threads`
     * worker so that file operations never block the event loop.
     *
     * When `false` (the default), runs storage operations in-process using
     * `fs.promises` which is already non-blocking via libuv.
     */
    readonly worker?: boolean;
    /**
     * Override the worker bootstrap script URL. Only used when
     * `worker: true`. Defaults to the built `node-worker-bootstrap.js`
     * shipped alongside this package.
     */
    readonly workerScript?: URL;
}

/**
 * Creates a Node.js persistence provider backed by `node:fs`.
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
 *
 * Pass `{ worker: true }` to move I/O off the calling thread into a
 * dedicated `node:worker_threads` worker.
 */
export const createNodeFsProvider = (
    root: string,
    options?: NodeFsProviderOptions,
): PersistenceProvider => ({
    providerName: "NodeFsProvider",

    async mount(
        database: Database<any, any, any, any, any, any, any, any>,
        mountOptions?: ProviderMountOptions,
    ): Promise<PersistenceMount> {
        await fs.mkdir(root, { recursive: true });
        const backend = await createNodeFsBackend(root);

        const useWorker = options?.worker ?? false;
        const transport = useWorker
            ? createNodeWorkerTransport({ root, workerScript: options?.workerScript })
            : createInprocessTransport(backend);

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
