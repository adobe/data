// © 2026 Adobe. MIT License. See /LICENSE for details.

// Node-only entry point. Re-exports node:fs-based factories and the
// node:worker_threads transport.

export { createNodeFsFile } from "./node-fs-file.js";
export { createNodeFsBackend } from "./node-fs-backend.js";
export { createNodeWorkerTransport, type NodeWorkerTransportOptions } from "./node-worker-transport.js";
