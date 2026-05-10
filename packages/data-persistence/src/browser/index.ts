// © 2026 Adobe. MIT License. See /LICENSE for details.

// Browser-only entry point. Re-exports OPFS-based factories and the
// browser worker transport. Note that the OPFS factories only function
// inside a dedicated Worker — main-thread imports are allowed (the
// factories will throw at call time, not at import).

export { createOpfsSyncFile } from "./opfs-sync-file.js";
export { createOpfsBackend } from "./opfs-backend.js";
export {
    createBrowserWorkerTransport,
    type BrowserWorkerTransportOptions,
} from "./browser-worker-transport.js";
export { createOpfsProvider } from "./create-opfs-provider.js";

/** @deprecated Use `mount(createOpfsProvider(root?), db, opts)` instead. */
export { mountOpfs } from "./mount-opfs.js";
