// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Boolean } from "../../../schema/boolean/index.js";
import { equals } from "../../../equals.js";
import { deserialize, serialize } from "../../../functions/serialization/serialize.js";
import type { Volume } from "../volume.js";
import { collectAxisSegments } from "../iterate-test-helpers.js";
import { getDenseIndex } from "../get-dense-index.js";
import { createBlockDims } from "./block-dims.js";
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

describe("createBlockDims", () => {
    it("accepts independent power-of-two sizes", () => {
        const dims = createBlockDims([32, 16, 8]);
        expect(dims.size).toEqual([32, 16, 8]);
        expect(dims.shiftX).toBe(5);
        expect(dims.shiftY).toBe(4);
        expect(dims.shiftZ).toBe(3);
        expect(dims.volume).toBe(4096);
        expect(dims.planeYZ).toBe(128);
        expect(dims.strideZ).toBe(512);
    });

    it("normalizes cubic scalar block size", () => {
        const dims = createBlockDims(16);
        expect(dims.size).toEqual([16, 16, 16]);
    });

    it("keyFromWorld matches inline pack for block coordinates", () => {
        const dims = createBlockDims([16, 8, 8]);
        expect(dims.keyFromWorld(17, 9, 1)).toBe(dims.keyFromWorld(16, 8, 0));
        expect(dims.indexFromWorld(17, 9, 1, 100)).toBe(100 + 1 + 16 * (1 + 8 * 1));
    });

    it("rejects non power-of-two sizes", () => {
        expect(() => createBlockDims([16, 12, 8])).toThrow(
            "SparseBlockVolume block size y must be a power of two",
        );
    });
});

describe("createSparseBlock", () => {
    it("starts empty with size 0,0,0", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        expect(volume.size).toEqual([0, 0, 0]);
        expect(volume.get(0, 0, 0)).toBe(false);
    });

    it("normalizes scalar block size to Vec3", () => {
        const volume = createSparseBlock(Boolean.schema, 16);
        if (!isSparseBlockVolume(volume)) {
            throw new Error("expected sparse block volume");
        }
        expect(volume.blockSize).toEqual([16, 16, 16]);
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

    it("allocates non-cubic blocks with per-axis volume", () => {
        const volume = createSparseBlock(Boolean.schema, [16, 8, 8]);
        volume.set(1, 2, 3, true);

        if (!isSparseBlockVolume(volume)) {
            throw new Error("expected sparse block volume");
        }
        expect(volume.blockSize).toEqual([16, 8, 8]);
        expect(volume.toSerialized().data.capacity).toBe(16 * 8 * 8);
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

    it("iterateX merges adjacent blocks with non-cubic dims", () => {
        const volume = createSparseBlock(Boolean.schema, [8, 4, 4]);
        volume.set(0, 0, 0, true);
        volume.set(7, 0, 0, true);
        volume.set(8, 0, 0, true);

        const originRow = collectAxisSegments(volume, "x").find(row => row.y === 0 && row.z === 0);

        expect(originRow?.pairCount).toBe(2);
        expect(originRow?.values).toEqual([
            true, false, false, false, false, false, false, true,
            true, false, false, false, false, false, false, false,
        ]);
        expect(originRow?.step).toBe(1);
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

    it("iterateY uses width stride for non-cubic blocks", () => {
        const volume = createSparseBlock(Boolean.schema, [8, 4, 4]);
        volume.set(0, 0, 0, true);
        volume.set(0, 3, 0, true);

        const originRow = collectAxisSegments(volume, "y").find(row => row.x === 0 && row.z === 0);

        expect(originRow?.step).toBe(8);
        expect(originRow?.values).toEqual([true, false, false, true]);
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

    it("iterateZ uses xy plane stride for non-cubic blocks", () => {
        const volume = createSparseBlock(Boolean.schema, [8, 4, 4]);
        volume.set(0, 0, 0, true);
        volume.set(0, 0, 3, true);

        const originRow = collectAxisSegments(volume, "z").find(row => row.x === 0 && row.y === 0);

        expect(originRow?.step).toBe(32);
        expect(originRow?.values).toEqual([true, false, false, true]);
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

    it("iterateBlocks visits each allocated block in key order", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(8, 0, 0, true);

        const blocks: { origin: readonly number[]; size: readonly number[]; offset: number; done: boolean }[] = [];
        volume.iterateBlocks((_buffer, block, done) => {
            blocks.push({ ...block, done });
        });

        expect(blocks).toHaveLength(2);
        expect(blocks[0]).toMatchObject({ origin: [0, 0, 0], size: [4, 4, 4], done: false });
        expect(blocks[1]).toMatchObject({ origin: [8, 0, 0], size: [4, 4, 4], done: true });
    });

    it("iterateBlocks no-ops before any block is allocated", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        let count = 0;
        volume.iterateBlocks(() => { count++; });
        expect(count).toBe(0);
    });

    it("iterateBlocks uses standard dense layout within each block", () => {
        const volume = createSparseBlock(Boolean.schema, [8, 4, 4]);
        volume.set(1, 2, 3, true);

        volume.iterateBlocks((buffer, block, done) => {
            expect(done).toBe(true);
            expect(buffer.get(block.offset + getDenseIndex(block.size, 1, 2, 3))).toBe(true);
        });
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
            expect(roundTrip.volume.blockSize).toEqual([16, 16, 16]);
        }
    });

    it("deserializes legacy scalar blockSize payloads", () => {
        const data = createTypedBuffer(Boolean.schema, 16 ** 3);
        const volume = SparseBlockVolume.fromSerialized(16, data, [1, 1, 1], []);
        expect(volume.blockSize).toEqual([16, 16, 16]);
    });
});

describe("SparseBlockVolume", () => {
    it("rejects non-power-of-two block sizes", () => {
        expect(() => new SparseBlockVolume([10, 16, 16], createTypedBuffer(Boolean.schema, 0)))
            .toThrow("SparseBlockVolume block size x must be a power of two");
    });
});
