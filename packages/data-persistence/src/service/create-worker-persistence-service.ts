// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Backwards-compatibility shim. New code should use
// `createIncrementalPersistenceService` from
// `./create-incremental-persistence-service.js`.

export { createIncrementalPersistenceService as createWorkerPersistenceService } from "./create-incremental-persistence-service.js";
