import { describe, expect, it } from "vitest";
import { claimPiece, startRanges } from "./claims.js";
import { lineWords } from "./protocol.js";

const drain = (words: Int32Array, self: number, participants: number): number[] => {
    const claimed: number[] = [];
    for (let piece = claimPiece(words, self, participants); piece >= 0; piece = claimPiece(words, self, participants)) claimed.push(piece);
    return claimed;
};

describe("claims", () => {
    it("take the home range in order, then steal from the back of the fullest", () => {
        const words = new Int32Array(new SharedArrayBuffer(3 * lineWords * 4));
        startRanges(words, 3, 10);
        // Ranges: 0..3, 3..6, 6..10.
        expect(claimPiece(words, 1, 3)).toBe(3);
        expect(claimPiece(words, 1, 3)).toBe(4);
        expect(claimPiece(words, 1, 3)).toBe(5);
        // Participant 2 has 4 left, more than participant 0's 3.
        expect(claimPiece(words, 1, 3)).toBe(9);
        expect(claimPiece(words, 1, 3)).toBe(2);
        expect(drain(words, 0, 3)).toEqual([0, 1, 8, 7, 6]);
        expect(claimPiece(words, 2, 3)).toBe(-1);
    });

    it("claim every piece exactly once however participants interleave", () => {
        for (const [participants, pieces] of [[1, 1], [4, 3], [9, 72], [7, 100]]) {
            const words = new Int32Array(new SharedArrayBuffer(participants * lineWords * 4));
            startRanges(words, participants, pieces);
            const claimed: number[] = [];
            let active = participants;
            for (let turn = 0; active > 0; turn = (turn * 5 + 3) % participants) {
                const piece = claimPiece(words, turn, participants);
                if (piece < 0) active--;
                else claimed.push(piece);
                if (claimed.length > pieces) break;
            }
            expect(claimed.sort((a, b) => a - b)).toEqual(Array.from({ length: pieces }, (_, i) => i));
        }
    });
});
