// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { MountOptions, PersistenceMount } from "../service/worker-persistence-service.js";
import { mount } from "../provider/mount.js";
import { createOpfsProvider } from "./create-opfs-provider.js";

/**
 * @deprecated Use `mount(createOpfsProvider(root?), database, opts)` instead.
 *
 * ```ts
 * import { mount } from "@adobe/data-persistence";
 * import { createOpfsProvider } from "@adobe/data-persistence/browser";
 *
 * const m = await mount(createOpfsProvider(), database);
 * ```
 */
export const mountOpfs = async (
    options: Omit<MountOptions<FileSystemDirectoryHandle>, "root"> &
        Partial<Pick<MountOptions<FileSystemDirectoryHandle>, "root">>,
): Promise<PersistenceMount> =>
    mount(
        createOpfsProvider(options.root),
        options.database,
        { autoPersist: options.autoPersist, checkpoint: options.checkpoint },
    );
