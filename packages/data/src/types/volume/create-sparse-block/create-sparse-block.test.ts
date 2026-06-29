// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Boolean } from "../../../schema/boolean/index.js";
import { equals } from "../../../equals.js";
import { deserialize, serialize } from "../../../functions/serialization/serialize.js";
import type { Volume } from "../volume.js";
import { collectAxisSegments } from "../iterate-test-helpers.js";
import { createSparseBlock } from "./create-sparse-block.js";
import { isSparseBlockVolume } from "./is-sparse-block-volume.js";
import { packBlockKey } from "./pack-block-key.js";
import { unpackBlockKey } from "./unpack-block-key.js";
import { createTypedBuffer } from "../../../typed-buffer/create-typed-buffer.js";
import { SparseBlockVolume } from "./sparse-block-volume.js";

describe("packBlockKey", () => {
    it("round-trips block coordinates", () => {
        const key = packBlockKey(3, -2, 10);
        expect(unpackBlockKey(key)).toEqual({ bx: 3, by: -2, bz: 10 });
    });
});

describe("createSparseBlock", () => {
    it("starts empty with size 0,0,0", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        expect(volume.size).toEqual([0, 0, 0]);
        expect(volume.get(0, 0, 0)).toBe(false);
    });

    it("allocates a block on first set and expands size", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        volume.set(1, 2, 3, true);

        expect(volume.size).toEqual([2, 3, 4]);
        expect(volume.get(1, 2, 3)).toBe(true);
        expect(volume.get(0, 0, 0)).toBe(false);
        expect(isSparseBlockVolume(volume)).toBe(true);
        if (isSparseBlockVolume(volume)) {
            expect(volume.toSerialized().blocks).toHaveLength(1);
            expect(volume.toSerialized().data.capacity).toBe(16 ** 3);
        }
    });

    it("uses separate blocks for distant coordinates", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        volume.set(0, 0, 0, true);
        volume.set(16, 0, 0, true);

        if (!isSparseBlockVolume(volume)) {
            throw new Error("expected sparse block volume");
        }
        expect(volume.toSerialized().blocks).toHaveLength(2);
        expect(volume.get(0, 0, 0)).toBe(true);
        expect(volume.get(16, 0, 0)).toBe(true);
        expect(volume.get(1, 0, 0)).toBe(false);
    });

    it("returns default for unset voxels in allocated blocks", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        volume.set(0, 0, 0, true);
        expect(volume.get(1, 0, 0)).toBe(false);
    });

    it("requires schema default at creation", () => {
        expect(() => createSparseBlock(
            { type: "boolean" } as Schema & { default: boolean },
            16,
        )).toThrow(
            "SparseBlockVolume schema must include a default value",
        );
    });

    it("iterateX merges adjacent blocks along x into one callback per row", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(3, 0, 0, true);
        volume.set(4, 0, 0, true);

        const rows = collectAxisSegments(volume, "x");
        const originRow = rows.find(row => row.y === 0 && row.z === 0);

        expect(rows).toHaveLength(16);
        expect(originRow?.pairCount).toBe(2);
        expect(originRow?.values).toEqual([
            true, false, false, true,
            true, false, false, false,
        ]);
        expect(originRow?.x).toBe(0);
        expect(rows.at(-1)?.done).toBe(true);
    });

    it("iterateX keeps non-adjacent blocks on separate callbacks", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(8, 0, 0, true);

        const atOrigin = collectAxisSegments(volume, "x").filter(row => row.y === 0 && row.z === 0);

        expect(atOrigin).toHaveLength(2);
        expect(atOrigin.every(row => row.pairCount === 1)).toBe(true);
        expect(atOrigin[0]?.values[0]).toBe(true);
        expect(atOrigin[1]?.values[0]).toBe(true);
        expect(atOrigin[0]?.x).toBe(0);
        expect(atOrigin[1]?.x).toBe(8);
    });

    it("iterateY merges adjacent blocks along y into one callback per column", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(0, 3, 0, true);
        volume.set(0, 4, 0, true);

        const originRow = collectAxisSegments(volume, "y").find(row => row.x === 0 && row.z === 0);

        expect(originRow?.pairCount).toBe(2);
        expect(originRow?.values).toEqual([
            true, false, false, true,
            true, false, false, false,
        ]);
        expect(originRow?.y).toBe(0);
    });

    it("iterateZ merges adjacent blocks along z into one callback per column", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(0, 0, 3, true);
        volume.set(0, 0, 4, true);

        const originRow = collectAxisSegments(volume, "z").find(row => row.x === 0 && row.y === 0);

        expect(originRow?.pairCount).toBe(2);
        expect(originRow?.values).toEqual([
            true, false, false, true,
            true, false, false, false,
        ]);
        expect(originRow?.z).toBe(0);
    });

    it("iterateX walks each block as dense x rows", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(3, 0, 0, true);
        volume.set(4, 0, 0, true);

        const rows = collectAxisSegments(volume, "x");

        expect(rows).toHaveLength(16);
        expect(rows.every(row => row.step === 1)).toBe(true);
        expect(rows.find(row => row.y === 0 && row.z === 0)?.values[4]).toBe(true);
        expect(rows.at(-1)?.done).toBe(true);
    });

    it("iterateY walks each block as dense y columns", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(0, 3, 0, true);

        const rows = collectAxisSegments(volume, "y");
        const originRow = rows.find(row => row.x === 0 && row.z === 0);

        expect(rows).toHaveLength(16);
        expect(originRow).toEqual({
            x: 0, y: 0, z: 0,
            values: [true, false, false, true],
            step: 4,
            pairCount: 1,
            done: false,
        });
        expect(rows.every(row => row.step === 4 && row.y === 0)).toBe(true);
        expect(rows.at(-1)?.done).toBe(true);
    });

    it("iterateZ walks each block as dense z columns", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(0, 0, 3, true);

        const rows = collectAxisSegments(volume, "z");
        const originRow = rows.find(row => row.x === 0 && row.y === 0);

        expect(rows).toHaveLength(16);
        expect(originRow).toEqual({
            x: 0, y: 0, z: 0,
            values: [true, false, false, true],
            step: 16,
            pairCount: 1,
            done: false,
        });
        expect(rows.every(row => row.step === 16 && row.z === 0)).toBe(true);
        expect(rows.at(-1)?.done).toBe(true);
    });

    it("axis iterators no-op before any block is allocated", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        expect(collectAxisSegments(volume, "x")).toEqual([]);
        expect(collectAxisSegments(volume, "y")).toEqual([]);
        expect(collectAxisSegments(volume, "z")).toEqual([]);
    });

    it("round-trips through ECS serialization", () => {
        const original = createSparseBlock(Boolean.schema, 16);
        original.set(0, 0, 0, true);
        original.set(20, 5, 3, true);

        const payload = serialize({ volume: original });
        const roundTrip = deserialize<{ volume: Volume<boolean> }>(payload);

        expect(isSparseBlockVolume(roundTrip.volume)).toBe(true);
        expect(roundTrip.volume.size).toEqual([21, 6, 4]);
        expect(roundTrip.volume.get(0, 0, 0)).toBe(true);
        expect(roundTrip.volume.get(20, 5, 3)).toBe(true);
        expect(roundTrip.volume.get(1, 0, 0)).toBe(false);
        if (isSparseBlockVolume(original) && isSparseBlockVolume(roundTrip.volume)) {
            expect(equals(roundTrip.volume.toSerialized().data, original.toSerialized().data)).toBe(true);
        }
    });
});

describe("SparseBlockVolume", () => {
    it("rejects non-power-of-two block sizes", () => {
        expect(() => new SparseBlockVolume(10, createTypedBuffer(Boolean.schema, 0)))
            .toThrow("SparseBlockVolume blockSize must be a power of two");
    });
});
