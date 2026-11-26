// © 2026 Adobe. MIT License. See /LICENSE for details.

import {
    JOURNAL_HEADER_BYTES,
    JournalEntry,
    JournalEntryKindCode,
    JournalEntryKindName,
} from "./journal-entry.js";

/**
 * Encode a single journal entry into a freshly-allocated, transferable
 * ArrayBuffer ready for `postMessage`'s transfer list (or for direct
 * `appendAt` after wrapping in a Uint8Array). Allocates exactly one
 * buffer per call; variable-length payload is copied in.
 *
 * Returning `ArrayBuffer` (not `Uint8Array`) lets the call site avoid
 * an extra copy when it just needs to forward the bytes to a worker.
 */
export const encodeJournalEntry = (entry: JournalEntry): ArrayBuffer => {
    const total = JOURNAL_HEADER_BYTES + entry.bytes.byteLength;
    const buffer = new ArrayBuffer(total);
    const view = new DataView(buffer);
    view.setUint32(0, entry.txId, true);
    view.setFloat64(4, entry.timestampMs, true);
    view.setUint8(12, JournalEntryKindCode[entry.kind]);
    view.setInt32(13, entry.entity, true);
    view.setUint16(17, entry.archetypeId, true);
    view.setUint32(19, entry.rowIndex, true);
    view.setUint16(23, entry.componentId, true);
    view.setUint32(25, entry.bytes.byteLength, true);
    if (entry.bytes.byteLength > 0) {
        new Uint8Array(buffer, JOURNAL_HEADER_BYTES).set(entry.bytes);
    }
    return buffer;
};

/**
 * Decode a single journal entry from a buffer at the given offset. Throws
 * if the kind code is unknown or if the buffer is shorter than the
 * declared payload.
 *
 * @returns the decoded entry plus the offset of the next entry.
 */
export const decodeJournalEntry = (
    buffer: ArrayBufferLike,
    offset: number,
): { entry: JournalEntry; nextOffset: number } => {
    const view = new DataView(buffer, offset);
    const kindCode = view.getUint8(12);
    const kind = JournalEntryKindName[kindCode];
    if (kind === undefined) {
        throw new Error(`Unknown journal entry kind code: ${kindCode}`);
    }
    const txId = view.getUint32(0, true);
    const timestampMs = view.getFloat64(4, true);
    const entity = view.getInt32(13, true);
    const archetypeId = view.getUint16(17, true);
    const rowIndex = view.getUint32(19, true);
    const componentId = view.getUint16(23, true);
    const byteLen = view.getUint32(25, true);
    const payloadStart = offset + JOURNAL_HEADER_BYTES;
    if (payloadStart + byteLen > buffer.byteLength) {
        throw new Error(
            `Journal entry payload truncated at offset ${offset}: declared ${byteLen} bytes, only ${buffer.byteLength - payloadStart} available`,
        );
    }
    const bytes = new Uint8Array(buffer, payloadStart, byteLen).slice();
    return {
        entry: { txId, timestampMs, kind, entity, archetypeId, rowIndex, componentId, bytes },
        nextOffset: payloadStart + byteLen,
    };
};

/**
 * Decode all journal entries in a buffer. Stops at first truncation,
 * which represents a partial write that crashed mid-entry; entries up
 * to that point are returned.
 */
export const decodeJournalStream = (buffer: ArrayBufferLike): readonly JournalEntry[] => {
    const out: JournalEntry[] = [];
    let offset = 0;
    while (offset + JOURNAL_HEADER_BYTES <= buffer.byteLength) {
        try {
            const { entry, nextOffset } = decodeJournalEntry(buffer, offset);
            out.push(entry);
            offset = nextOffset;
        } catch {
            // Truncated tail (partial write at crash) — ignore the
            // remainder and return what we have.
            break;
        }
    }
    return out;
};
