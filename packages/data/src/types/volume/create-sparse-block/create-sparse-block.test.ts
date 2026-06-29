// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Boolean } from "../../../schema/boolean/index.js";
import { equals } from "../../../equals.js";
import { deserialize, serialize } from "../../../functions/serialization/serialize.js";
import type { Volume } from "../volume.js";
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

    it("iterates each block as dense rows", () => {
        const volume = createSparseBlock(Boolean.schema, 4);
        volume.set(0, 0, 0, true);
        volume.set(3, 0, 0, true);
        volume.set(4, 0, 0, true);

        const rows: { x: number; y: number; z: number; values: boolean[]; done: boolean }[] = [];
        let segmentsRef: number[] | undefined;

        volume.iterate((buffer, segments, step, x, y, z, done) => {
            if (segmentsRef === undefined) {
                segmentsRef = segments;
            } else {
                expect(segments).toBe(segmentsRef);
            }
            expect(segments).toHaveLength(2);
            expect(step).toBe(1);
            expect(segments[1]).toBe(4);

            const values: boolean[] = [];
            const offset = segments[0];
            for (let i = 0; i < segments[1]; i++) {
                values.push(buffer.get(offset + i * step));
            }
            rows.push({ x, y, z, values, done });
        });

        expect(rows).toHaveLength(32);
        expect(rows[0]).toEqual({ x: 0, y: 0, z: 0, values: [true, false, false, true], done: false });
        expect(rows.find(row => row.x === 4 && row.y === 0 && row.z === 0)?.values[0]).toBe(true);
        expect(rows.at(-1)?.done).toBe(true);
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
