// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { JOURNAL_HEADER_BYTES, JournalEntry } from "./journal-entry.js";
import { decodeJournalEntry, decodeJournalStream, encodeJournalEntry } from "./journal-codec.js";

const sample = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
    txId: 42,
    timestampMs: 1735_000_000_000,
    kind: "update",
    entity: 17,
    archetypeId: 7,
    rowIndex: 13,
    componentId: 3,
    bytes: new Uint8Array([1, 2, 3, 4]),
    ...overrides,
});

// Tests work in Uint8Array space, so wrap the codec's ArrayBuffer
// return for ergonomic .set / .subarray access.
const encodeBytes = (entry: JournalEntry): Uint8Array => new Uint8Array(encodeJournalEntry(entry));

describe("journal codec", () => {
    it("round-trips a single entry", () => {
        const entry = sample();
        const buf = encodeBytes(entry);
        expect(buf.byteLength).toBe(JOURNAL_HEADER_BYTES + entry.bytes.byteLength);
        const { entry: decoded, nextOffset } = decodeJournalEntry(buf.buffer, 0);
        expect(decoded.txId).toBe(entry.txId);
        expect(decoded.timestampMs).toBe(entry.timestampMs);
        expect(decoded.kind).toBe(entry.kind);
        expect(decoded.entity).toBe(entry.entity);
        expect(decoded.archetypeId).toBe(entry.archetypeId);
        expect(decoded.rowIndex).toBe(entry.rowIndex);
        expect(decoded.componentId).toBe(entry.componentId);
        expect(Array.from(decoded.bytes)).toEqual([1, 2, 3, 4]);
        expect(nextOffset).toBe(buf.byteLength);
    });

    it("round-trips an entry with empty payload (e.g. delete)", () => {
        const entry = sample({ kind: "delete", componentId: 0, bytes: new Uint8Array(0) });
        const buf = encodeBytes(entry);
        expect(buf.byteLength).toBe(JOURNAL_HEADER_BYTES);
        const { entry: decoded } = decodeJournalEntry(buf.buffer, 0);
        expect(decoded.kind).toBe("delete");
        expect(decoded.bytes.byteLength).toBe(0);
    });

    it("decodes a stream of multiple entries", () => {
        const entries = [
            sample({ txId: 1 }),
            sample({ txId: 2, kind: "insert", bytes: new Uint8Array([9, 9, 9]) }),
            sample({ txId: 3, kind: "delete", componentId: 0, bytes: new Uint8Array(0) }),
        ];
        const concat = new Uint8Array(
            entries.reduce((sum, e) => sum + JOURNAL_HEADER_BYTES + e.bytes.byteLength, 0),
        );
        let offset = 0;
        for (const e of entries) {
            const enc = encodeBytes(e);
            concat.set(enc, offset);
            offset += enc.byteLength;
        }
        const decoded = decodeJournalStream(concat.buffer);
        expect(decoded.length).toBe(3);
        expect(decoded.map(d => d.txId)).toEqual([1, 2, 3]);
        expect(decoded[1]!.kind).toBe("insert");
    });

    it("decodeJournalStream tolerates a truncated tail entry", () => {
        const entry = sample({ bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) });
        const enc = encodeBytes(entry);
        const truncated = enc.subarray(0, enc.byteLength - 3);
        const decoded = decodeJournalStream(truncated.buffer.slice(truncated.byteOffset, truncated.byteOffset + truncated.byteLength));
        expect(decoded.length).toBe(0);
    });

    it("decodeJournalStream returns the prefix when only the tail is torn", () => {
        const ok = encodeBytes(sample({ txId: 100 }));
        const torn = encodeBytes(sample({ txId: 101, bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }));
        const tornShort = torn.subarray(0, torn.byteLength - 3);
        const total = ok.byteLength + tornShort.byteLength;
        const buf = new Uint8Array(total);
        buf.set(ok, 0);
        buf.set(tornShort, ok.byteLength);
        const decoded = decodeJournalStream(buf.buffer);
        expect(decoded.length).toBe(1);
        expect(decoded[0]!.txId).toBe(100);
    });

    it("rejects unknown kind code", () => {
        const buf = encodeBytes(sample());
        new DataView(buf.buffer).setUint8(12, 99);
        expect(() => decodeJournalEntry(buf.buffer, 0)).toThrow(/Unknown journal entry kind code/);
    });

    it("preserves negative entity values (ephemeral / sentinel)", () => {
        const entry = sample({ entity: -1 });
        const buf = encodeBytes(entry);
        const { entry: decoded } = decodeJournalEntry(buf.buffer, 0);
        expect(decoded.entity).toBe(-1);
    });

    it("preserves a large positive entity id", () => {
        const entry = sample({ entity: 0x7fff_fffe });
        const buf = encodeBytes(entry);
        const { entry: decoded } = decodeJournalEntry(buf.buffer, 0);
        expect(decoded.entity).toBe(0x7fff_fffe);
    });

    it("returns a fresh, transferable ArrayBuffer (zero-copy worker handoff)", () => {
        const buf = encodeJournalEntry(sample());
        // Type guarantee: encodeJournalEntry returns ArrayBuffer (not
        // SharedArrayBuffer / Uint8Array) so the call site can list
        // it directly in postMessage's transfer set.
        expect(buf).toBeInstanceOf(ArrayBuffer);
        expect(buf.byteLength).toBe(JOURNAL_HEADER_BYTES + 4);
    });
});
