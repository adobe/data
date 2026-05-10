// © 2026 Adobe. MIT License. See /LICENSE for details.

// Node-only entry point. Re-exports node:fs-based factories and the
// node:worker_threads transport.

export { createNodeFsFile } from "./node-fs-file.js";
export { createNodeFsBackend, type NodeFsBackendOptions } from "./node-fs-backend.js";
export { createNodeWorkerTransport, type NodeWorkerTransportOptions } from "./node-worker-transport.js";
export { createNodeFsProvider, type NodeFsProviderOptions } from "./create-node-fs-provider.js";

/** @deprecated Use `mount(createNodeFsProvider(root), db, opts)` instead. */
export { mountNodeFs } from "./mount-node-fs.js";
