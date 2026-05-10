// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import {
    decodeJournalSnapshot,
    encodeJournalSnapshot,
} from "./journal-snapshot-codec.js";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("journal-snapshot-codec", () => {
    it("round-trips an empty row list", () => {
        const buf = encodeJournalSnapshot([]);
        const rows = decodeJournalSnapshot(buf);
        expect(rows).toHaveLength(0);
    });

    it("round-trips a single present row", () => {
        const encoded = utf8(JSON.stringify("hello"));
        const buf = encodeJournalSnapshot([encoded]);
        const rows = decodeJournalSnapshot(buf);
        expect(rows).toHaveLength(1);
        expect(JSON.parse(new TextDecoder().decode(rows[0]))).toBe("hello");
    });

    it("round-trips many rows", () => {
        const input = ["alpha", "beta", "gamma"].map((s) =>
            utf8(JSON.stringify(s)),
        );
        const buf = encodeJournalSnapshot(input);
        const rows = decodeJournalSnapshot(buf);
        expect(rows).toHaveLength(3);
        for (let i = 0; i < input.length; i++) {
            expect(JSON.parse(new TextDecoder().decode(rows[i]))).toBe(
                ["alpha", "beta", "gamma"][i],
            );
        }
    });

    it("encodes undefined rows as ABSENT and decodes back to undefined", () => {
        const buf = encodeJournalSnapshot([undefined, utf8('"present"'), undefined]);
        const rows = decodeJournalSnapshot(buf);
        expect(rows).toHaveLength(3);
        expect(rows[0]).toBeUndefined();
        expect(JSON.parse(new TextDecoder().decode(rows[1]))).toBe("present");
        expect(rows[2]).toBeUndefined();
    });

    it("encodes empty Uint8Array as ABSENT", () => {
        const buf = encodeJournalSnapshot([new Uint8Array(0)]);
        const rows = decodeJournalSnapshot(buf);
        expect(rows[0]).toBeUndefined();
    });

    it("torn count header returns empty array", () => {
        const truncated = new ArrayBuffer(2); // less than 4 bytes for count
        const rows = decodeJournalSnapshot(truncated);
        expect(rows).toHaveLength(0);
    });

    it("torn record len header returns prefix only", () => {
        const full = encodeJournalSnapshot([
            utf8('"a"'),
            utf8('"b"'),
            utf8('"c"'),
        ]);
        // Truncate to include the count + first record + half the second record's header
        // count(4) + len(4) + 3 bytes for "a" (utf8 of JSON.stringify("a") = '"a"' = 3 chars)
        // + 2 bytes of the second record's len header
        const truncated = full.slice(0, 4 + 4 + 3 + 2);
        const rows = decodeJournalSnapshot(truncated);
        expect(rows).toHaveLength(3);
        // First row is intact
        expect(JSON.parse(new TextDecoder().decode(rows[0]!))).toBe("a");
        // Remaining rows should be undefined (torn)
        expect(rows[1]).toBeUndefined();
        expect(rows[2]).toBeUndefined();
    });

    it("torn record body returns prefix only", () => {
        const full = encodeJournalSnapshot([
            utf8('"first"'),
            utf8('"second"'),
        ]);
        // Keep count + first full record + second record's len header but truncate the body
        // '"first"' is 7 bytes
        const truncated = full.slice(0, 4 + 4 + 7 + 4 + 2);
        const rows = decodeJournalSnapshot(truncated);
        expect(rows).toHaveLength(2);
        expect(JSON.parse(new TextDecoder().decode(rows[0]!))).toBe("first");
        expect(rows[1]).toBeUndefined();
    });

    it("round-trips array values (JSON arrays as row values)", () => {
        const input = [
            utf8(JSON.stringify(["tag-a", "tag-b"])),
            utf8(JSON.stringify(["tag-c"])),
        ];
        const buf = encodeJournalSnapshot(input);
        const rows = decodeJournalSnapshot(buf);
        expect(rows).toHaveLength(2);
        expect(JSON.parse(new TextDecoder().decode(rows[0]!))).toEqual(["tag-a", "tag-b"]);
        expect(JSON.parse(new TextDecoder().decode(rows[1]!))).toEqual(["tag-c"]);
    });

    it("produces distinct Uint8Array slices (no shared backing buffer)", () => {
        const input = [utf8('"x"'), utf8('"y"')];
        const buf = encodeJournalSnapshot(input);
        const rows = decodeJournalSnapshot(buf);
        // Modifying one row should not affect the other
        rows[0]![0] = 0xff;
        expect(rows[1]![0]).not.toBe(0xff);
    });
});
