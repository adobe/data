// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Entity } from "./entity.js";
import { quadrantFor, quadrantOf, toEntity, toLocalIndex } from "./persistence-sharing.js";

// Quadrant encoding: bit0 = non-persistent, bit1 = non-shared.
//   0 = persistent + shared      (document)
//   1 = non-persistent + shared  (presence)
//   2 = persistent + non-shared  (settings)
//   3 = non-persistent + non-shared (session)
describe("Entity persistence/sharing quadrant", () => {
    it("isPersistent / isNonPersistent read bit 0", () => {
        expect(Entity.isPersistent(0)).toBe(true);
        expect(Entity.isNonPersistent(0)).toBe(false);
        expect(Entity.isPersistent(2)).toBe(true); // settings: persistent
        expect(Entity.isNonPersistent(1)).toBe(true); // presence: non-persistent
        expect(Entity.isNonPersistent(3)).toBe(true); // session: non-persistent
    });

    it("isShared / isNonShared read bit 1", () => {
        expect(Entity.isShared(0)).toBe(true); // document: shared
        expect(Entity.isShared(1)).toBe(true); // presence: shared
        expect(Entity.isNonShared(2)).toBe(true); // settings: non-shared
        expect(Entity.isNonShared(3)).toBe(true); // session: non-shared
        expect(Entity.isShared(2)).toBe(false);
    });

    it("classifies every quadrant of a shared local index", () => {
        const cases: Array<[boolean, boolean]> = [
            [false, false], // document
            [true, false],  // presence
            [false, true],  // settings
            [true, true],   // session
        ];
        for (const [nonPersistent, nonShared] of cases) {
            const q = quadrantFor(nonPersistent, nonShared);
            const e = toEntity(37, q);
            expect(quadrantOf(e)).toBe(q);
            expect(Entity.isNonPersistent(e)).toBe(nonPersistent);
            expect(Entity.isNonShared(e)).toBe(nonShared);
            expect(toLocalIndex(e)).toBe(37);
        }
    });

    it("round-trips local index through the top 30 bits", () => {
        for (const q of [0, 1, 2, 3]) {
            for (const idx of [0, 1, 2, 1000, 1 << 20]) {
                expect(toLocalIndex(toEntity(idx, q))).toBe(idx);
                expect(quadrantOf(toEntity(idx, q))).toBe(q);
            }
        }
    });

    it("none is the last representable id and past any allocatable local index", () => {
        // The maximum local index the encoding can carry; the allocator never
        // reaches it, so `none` decodes to an id no live entity occupies.
        const maxLocalIndex = (1 << (32 - 2)) - 1;
        expect(toLocalIndex(Entity.none)).toBe(maxLocalIndex);
        expect(Entity.none).toBe(-1);
    });
});
