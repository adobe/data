// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { RandomAccessFile } from "./random-access-file.js";

/**
 * A directory of RandomAccessFile handles, rooted at some host-defined
 * location (an OPFS directory, a Node fs path, or an in-memory map).
 *
 * All paths are relative to the root and validated by {@link validateRelPath}
 * to prevent path traversal.
 */
export interface PersistenceBackend {
    /**
     * Open (and create if missing) a file at `relPath`.
     */
    open(relPath: string): Promise<RandomAccessFile>;
    /**
     * List entries directly under `relPath`. Returns names only, not full paths.
     */
    list(relPath: string): Promise<readonly string[]>;
    /**
     * Remove a file. No-op if the file does not exist.
     */
    remove(relPath: string): Promise<void>;
    /**
     * Atomic rename within the root.
     */
    rename(from: string, to: string): Promise<void>;
    /**
     * Optional teardown hook. Backends that hold process-wide resources
     * — a single-writer lock file, a sync access handle, an open
     * directory descriptor — release them here. The router calls this
     * during `close()`. Backends without persistent resources can omit
     * it.
     */
    dispose?(): Promise<void>;
}
