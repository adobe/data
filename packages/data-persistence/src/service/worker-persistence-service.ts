// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Backwards-compatibility shim. New code should import from
// `./incremental-persistence-service.js` or from `@adobe/data-persistence`
// directly. The names below are deprecated and will be removed in a future
// release.

export type {
    IncrementalPersistenceService,
    IncrementalPersistenceServiceOptions,
} from "./incremental-persistence-service.js";

export type { ProviderMountOptions as _ProviderMountOptions } from "../provider/persistence-provider.js";

import type { IncrementalPersistenceService, IncrementalPersistenceServiceOptions } from "./incremental-persistence-service.js";
import type { PersistenceMount, ProviderMountOptions } from "../provider/persistence-provider.js";
import type { Database } from "@adobe/data/ecs";

/**
 * @deprecated Use `IncrementalPersistenceService` instead.
 */
export type WorkerPersistenceService = IncrementalPersistenceService;

/**
 * @deprecated Use `IncrementalPersistenceServiceOptions` instead.
 */
export type WorkerPersistenceServiceOptions = IncrementalPersistenceServiceOptions;

/**
 * @deprecated Use `PersistenceMount` from `@adobe/data-persistence` instead.
 */
export type { PersistenceMount };

/**
 * @deprecated Use `ProviderMountOptions` instead.
 */
export interface MountOptions<R extends string | FileSystemDirectoryHandle> extends ProviderMountOptions {
    readonly root: R;
    readonly database: Database<any, any, any, any, any, any, any, any>;
}
