// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Test-only worker bootstrap for OPFS lock behavior. The main-thread
// test sends `{ cmd: "acquire", dirName }` and we try to construct an
// OPFS backend on `<opfs root>/<dirName>`. We post back `acquired` or
// `failed` (with the message). On `{ cmd: "release" }` we dispose
// the backend.
//
// This file lives next to the OPFS sources so Vite's test transform
// picks it up via `new URL(...)` from the test file.

/// <reference lib="webworker" />

import { createOpfsBackend } from "./opfs-backend.js";
import type { PersistenceBackend } from "../backend/persistence-backend.js";

declare const self: DedicatedWorkerGlobalScope;

type InMessage =
    | { readonly cmd: "acquire"; readonly id: number; readonly dirName: string }
    | { readonly cmd: "release"; readonly id: number };

type OutMessage =
    | { readonly cmd: "acquired"; readonly id: number }
    | { readonly cmd: "failed"; readonly id: number; readonly error: string }
    | { readonly cmd: "released"; readonly id: number };

let backend: PersistenceBackend | null = null;

const post = (msg: OutMessage): void => self.postMessage(msg);

self.addEventListener("message", (ev: MessageEvent<InMessage>) => {
    const msg = ev.data;
    if (msg.cmd === "acquire") {
        void (async () => {
            try {
                const opfs = await navigator.storage.getDirectory();
                const subdir = await opfs.getDirectoryHandle(msg.dirName, { create: true });
                backend = await createOpfsBackend(subdir);
                post({ cmd: "acquired", id: msg.id });
            } catch (err) {
                post({
                    cmd: "failed",
                    id: msg.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })();
        return;
    }
    if (msg.cmd === "release") {
        void (async () => {
            try {
                if (backend !== null) {
                    await backend.dispose?.();
                    backend = null;
                }
            } finally {
                post({ cmd: "released", id: msg.id });
            }
        })();
        return;
    }
});
