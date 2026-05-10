// © 2026 Adobe. MIT License. See /LICENSE for details.

// Runtime-agnostic public surface. Browser-only and node-only entry
// points live under ./browser/index.ts and ./node/index.ts respectively
// and re-export the runtime-specific factories.

export type { RandomAccessFile } from "./backend/random-access-file.js";
export { createMemoryFile } from "./backend/memory-file.js";

export type {
    PersistenceBackend,
    PersistenceBackendCapabilities,
} from "./backend/persistence-backend.js";
export { createMemoryBackend } from "./backend/memory-backend.js";
export { validateRelPath } from "./backend/validate-rel-path.js";

export type { Transport, PersistOp, PersistMessage, AckMessage } from "./transport/transport.js";
export { createInprocessTransport } from "./transport/inprocess-transport.js";

export type {
    ColumnEncoder,
    EncodedColumnSlice,
    Manifest,
    ArchetypeManifest,
    ColumnManifest,
} from "./encoder/types.js";
export { createColumnEncoder } from "./encoder/create-column-encoder.js";

export type { JournalEntry, JournalEntryKind } from "./journal/journal-entry.js";
export { encodeJournalEntry, decodeJournalEntry, decodeJournalStream } from "./journal/journal-codec.js";

// ─── New provider API ────────────────────────────────────────────────────────

export type {
    PersistenceProvider,
    ProviderMountOptions,
    PersistenceMount,
} from "./provider/persistence-provider.js";
export { mount } from "./provider/mount.js";
export { createMemoryProvider } from "./provider/create-memory-provider.js";

export type {
    IncrementalPersistenceService,
    IncrementalPersistenceServiceOptions,
} from "./service/incremental-persistence-service.js";
export { createIncrementalPersistenceService } from "./service/create-incremental-persistence-service.js";

// ─── Deprecated (backwards-compatible) ───────────────────────────────────────

/**
 * @deprecated Use `IncrementalPersistenceService` instead.
 */
export type { WorkerPersistenceService, WorkerPersistenceServiceOptions, MountOptions } from "./service/worker-persistence-service.js";
/**
 * @deprecated Use `createIncrementalPersistenceService` instead.
 */
export { createWorkerPersistenceService } from "./service/create-worker-persistence-service.js";
