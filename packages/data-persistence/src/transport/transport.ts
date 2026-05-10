// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Manifest } from "../encoder/types.js";

/**
 * Operations sent from the ECS thread to the persistence worker. The
 * worker is a dumb byte router; all semantic mapping (component → file,
 * row → byte offset) is done by the encoder on the ECS thread before
 * the op is posted.
 */
export type PersistOp =
    | {
        readonly id: number;
        readonly kind: "writeColumnSlice";
        readonly archetypeId: number;
        readonly component: string;
        readonly rowOffset: number;
        readonly bytes: ArrayBuffer;
    }
    | {
        readonly id: number;
        readonly kind: "appendJournal";
        readonly bytes: ArrayBuffer;
    }
    | {
        readonly id: number;
        readonly kind: "writeEntityLocation";
        readonly entity: number;
        readonly archetypeId: number;
        readonly rowIndex: number;
    }
    | {
        readonly id: number;
        readonly kind: "deleteEntityLocation";
        readonly entity: number;
    }
    | {
        readonly id: number;
        readonly kind: "checkpoint";
        readonly manifest: Manifest;
    }
    | {
        readonly id: number;
        readonly kind: "writeJournalSnapshot";
        readonly archetypeId: number;
        readonly component: string;
        /** Full snapshot buffer from encodeJournalSnapshot — always written at offset 0 and truncated to this length. */
        readonly bytes: ArrayBuffer;
    }
    | {
        readonly id: number;
        readonly kind: "readFile";
        readonly path: string;
    }
    | {
        readonly id: number;
        readonly kind: "listDir";
        readonly path: string;
    };

/**
 * Reply payload for `readFile` requests. Carries the entire file
 * contents as an ArrayBuffer (zero-length for empty or non-existent
 * files; callers detect existence separately via `listDir`).
 * Returned via `transport.request()`.
 */
export interface ReadFileResult {
    readonly bytes: ArrayBuffer;
}

/**
 * Reply payload for `listDir` requests. Returns directory entry names
 * (not full paths). Empty array when the directory does not exist.
 */
export interface ListDirResult {
    readonly entries: readonly string[];
}

/** Acknowledgement message sent from worker back to the ECS thread. */
export interface AckMessage {
    readonly kind: "ack";
    readonly id: number;
    readonly value?: unknown;
    readonly error?: string;
}

export type PersistMessage = AckMessage;

/**
 * The transport layer between the ECS thread and the persistence
 * worker. Three implementations exist:
 *
 *   - InprocessTransport   - direct in-thread call (Node servers, tests)
 *   - BrowserWorkerTransport - DOM Worker + postMessage
 *   - NodeWorkerTransport    - node:worker_threads + parentPort
 */
export interface Transport {
    /**
     * Send an operation that does not require a response.
     */
    send(op: PersistOp, transfer?: readonly Transferable[]): void;
    /**
     * Send an operation and await its acknowledgement.
     */
    request<T = unknown>(op: PersistOp, transfer?: readonly Transferable[]): Promise<T>;
    /**
     * Subscribe to incoming messages from the worker side. Returns an
     * unsubscribe function.
     */
    onMessage(handler: (msg: PersistMessage) => void): () => void;
    /**
     * Wait for all currently-enqueued operations (sent via `send` or
     * `request`) to complete. Used by the service to drain pending
     * writes before checkpoints, snapshots, or shutdown.
     */
    flush(): Promise<void>;
    /**
     * Tear down the transport. Pending requests reject.
     */
    close(): Promise<void>;
}
