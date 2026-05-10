// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { MountOptions, PersistenceMount } from "../service/worker-persistence-service.js";
import { mount } from "../provider/mount.js";
import { createNodeFsProvider } from "./create-node-fs-provider.js";

/**
 * @deprecated Use `mount(createNodeFsProvider(root), database, opts)` instead.
 *
 * ```ts
 * import { mount } from "@adobe/data-persistence";
 * import { createNodeFsProvider } from "@adobe/data-persistence/node";
 *
 * const m = await mount(createNodeFsProvider("/tmp/my-db"), database);
 * ```
 */
export const mountNodeFs = async (
    options: MountOptions<string>,
): Promise<PersistenceMount> =>
    mount(
        createNodeFsProvider(options.root, { worker: true }),
        options.database,
        { autoPersist: options.autoPersist, checkpoint: options.checkpoint },
    );
