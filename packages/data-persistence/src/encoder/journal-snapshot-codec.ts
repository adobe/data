// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Codec for journal-storage ("array") column snapshot files.
//
// Format (all integers little-endian):
//
//   <count: u32>
//   [ <len: u32> <utf8-JSON-bytes: len bytes> ] × count
//
// Torn-tail tolerance: if a record's `len` would run past EOF, the
// decoder stops and returns only the records decoded so far. Rows that
// had no written value (sparse) are encoded as the 4-byte length 0xFFFFFFFF
// (ABSENT sentinel), decoded back to `undefined` so callers can skip
// setting them and let the archetype's default value stand.
//
// Why length-prefixed binary rather than a plain JSON array:
//
//   - One JSON.parse per record keeps peak memory bounded (O(max value
//     size)), whereas a top-level array materialises everything at once.
//   - A torn file leaves all complete records intact; a torn JSON file
//     is unparseable in its entirety.
//   - Matches the journal codec's torn-tail handling, keeping the
//     crash-safety story uniform across all persisted files.

const ABSENT = 0xffff_ffff;

/**
 * Encode an array of per-row UTF-8 JSON payloads into a snapshot
 * buffer. Pass `undefined` for rows that should be treated as absent
 * (the decoder will skip them; the archetype default stands).
 *
 * Each `Uint8Array` in `rows` must already be UTF-8 encoded JSON —
 * this mirrors the output of `JournalColumnEncoder.encodeRowValue`.
 */
export const encodeJournalSnapshot = (
    rows: ReadonlyArray<Uint8Array | undefined>,
): ArrayBuffer => {
    // Compute total byte size up-front so we do a single allocation.
    let totalBytes = 4; // count u32
    for (const row of rows) {
        totalBytes += 4; // len u32
        if (row !== undefined) {
            totalBytes += row.byteLength;
        }
    }

    const buf = new ArrayBuffer(totalBytes);
    const view = new DataView(buf);
    let offset = 0;

    view.setUint32(offset, rows.length, true);
    offset += 4;

    for (const row of rows) {
        if (row === undefined || row.byteLength === 0) {
            view.setUint32(offset, ABSENT, true);
            offset += 4;
        } else {
            view.setUint32(offset, row.byteLength, true);
            offset += 4;
            new Uint8Array(buf, offset, row.byteLength).set(row);
            offset += row.byteLength;
        }
    }

    return buf;
};

/**
 * Decode a snapshot buffer produced by {@link encodeJournalSnapshot}.
 *
 * Returns an array of length `count` where each element is either a
 * `Uint8Array` (the raw UTF-8 JSON bytes for that row) or `undefined`
 * (ABSENT — caller should not write the row into the buffer).
 *
 * Torn-tail: if any record's `len` extends past the buffer boundary,
 * all remaining records (including that one) are returned as `undefined`
 * and decoding stops — no error is thrown.
 */
export const decodeJournalSnapshot = (
    src: ArrayBuffer,
): ReadonlyArray<Uint8Array | undefined> => {
    const byteLength = src.byteLength;
    if (byteLength < 4) return [];

    const view = new DataView(src);
    let offset = 0;

    const count = view.getUint32(offset, true);
    offset += 4;

    const result: Array<Uint8Array | undefined> = new Array(count);

    for (let i = 0; i < count; i++) {
        if (offset + 4 > byteLength) {
            // Torn header — fill remainder with undefined.
            result.fill(undefined, i);
            break;
        }
        const len = view.getUint32(offset, true);
        offset += 4;

        if (len === ABSENT) {
            result[i] = undefined;
            continue;
        }

        if (offset + len > byteLength) {
            // Torn body — treat this and all remaining records as absent.
            result.fill(undefined, i);
            break;
        }

        result[i] = new Uint8Array(src, offset, len).slice();
        offset += len;
    }

    return result;
};
