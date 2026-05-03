// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Lowest-level file abstraction. The sole runtime seam between the
 * persistence package and the host environment.
 *
 * Implementations:
 *
 *   MemoryFile         - ArrayBuffer-backed; tests and the in-process
 *                        Node server option.
 *   NodeFsFile         - wraps node:fs.promises.FileHandle.
 *   OpfsSyncFile       - wraps FileSystemSyncAccessHandle (browser
 *                        dedicated worker only).
 *
 * The interface is async to keep the contract uniform across runtimes;
 * sync-handle implementations (OPFS) satisfy it with sync calls under
 * the hood.
 */
export interface RandomAccessFile {
    /**
     * Read `length` bytes starting at `offset`. May return fewer bytes
     * than requested if the read goes past EOF.
     */
    readAt(offset: number, length: number): Promise<Uint8Array>;
    /**
     * Write `bytes` starting at `offset`. Grows the file if necessary.
     */
    writeAt(offset: number, bytes: Uint8Array): Promise<void>;
    /**
     * Append `bytes` at the end of the file. Returns the new file size.
     */
    appendAt(bytes: Uint8Array): Promise<number>;
    /** Current file size in bytes. */
    size(): Promise<number>;
    /** Truncate the file to `length` bytes (zero-fills if growing). */
    truncate(length: number): Promise<void>;
    /** Flush any buffered writes to durable storage. */
    sync(): Promise<void>;
    /** Close the file handle. Subsequent operations reject. */
    close(): Promise<void>;
}
