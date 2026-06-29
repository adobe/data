// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import type { Schema } from "../../../schema/index.js";
import { Boolean } from "../../../schema/boolean/index.js";
import { equals } from "../../../equals.js";
import { deserialize, serialize } from "../../../functions/serialization/serialize.js";
import type { Volume } from "../volume.js";
import { createDense } from "./create-dense.js";
import { DenseVolume } from "./dense-volume.js";
import { isDenseVolume } from "./is-dense-volume.js";

describe("createDense", () => {
    it("creates a dense volume with typed buffer capacity matching size", () => {
        const volume = createDense([2, 3, 4], Boolean.schema);

        expect(volume).toBeInstanceOf(DenseVolume);
        expect(isDenseVolume(volume)).toBe(true);
        expect(volume.size).toEqual([2, 3, 4]);
        if (isDenseVolume(volume)) {
            expect(volume.data.capacity).toBe(24);
        }
    });

    it("reads and writes voxels by coordinate", () => {
        const volume = createDense([2, 2, 2], Boolean.schema);

        volume.set(1, 0, 1, true);
        expect(volume.get(1, 0, 1)).toBe(true);
        expect(volume.get(0, 0, 0)).toBe(false);
    });

    it("returns schema default for out-of-bounds get and ignores out-of-bounds set", () => {
        const volume = createDense([1, 1, 1], Boolean.schema);
        volume.set(0, 0, 0, true);
        expect(volume.get(1, 0, 0)).toBe(false);
        volume.set(0, 1, 0, true);
        expect(volume.get(0, 0, 0)).toBe(true);
    });

    it("requires schema default at creation", () => {
        expect(() => createDense(
            [1, 1, 1],
            { type: "boolean" } as Schema & { default: boolean },
        )).toThrow(
            "DenseVolume schema must include a default value",
        );
    });

    it("iterates each x row with reused segments", () => {
        const volume = createDense([3, 2, 2], Boolean.schema);
        volume.set(0, 0, 0, true);
        volume.set(1, 0, 0, true);
        volume.set(2, 1, 1, true);

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
            expect(x).toBe(0);

            const offset = segments[0];
            const length = segments[1];
            expect(length).toBe(3);

            const values: boolean[] = [];
            for (let i = 0; i < length; i++) {
                values.push(buffer.get(offset + i * step));
            }
            rows.push({ x, y, z, values, done });
        });

        expect(rows).toHaveLength(4);
        expect(rows[0]).toEqual({ x: 0, y: 0, z: 0, values: [true, true, false], done: false });
        expect(rows[1]).toEqual({ x: 0, y: 1, z: 0, values: [false, false, false], done: false });
        expect(rows[2]).toEqual({ x: 0, y: 0, z: 1, values: [false, false, false], done: false });
        expect(rows[3]).toEqual({ x: 0, y: 1, z: 1, values: [false, false, true], done: true });
    });

    it("round-trips through ECS serialization", () => {
        const original = createDense([3, 2, 2], Boolean.schema);
        original.set(0, 0, 0, true);
        original.set(2, 1, 1, true);

        const payload = serialize({ volume: original });
        const roundTrip = deserialize<{ volume: Volume<boolean> }>(payload);

        expect(isDenseVolume(roundTrip.volume)).toBe(true);
        expect(roundTrip.volume.size).toEqual([3, 2, 2]);
        if (isDenseVolume(original) && isDenseVolume(roundTrip.volume)) {
            expect(roundTrip.volume.data.capacity).toBe(12);
            expect(equals(roundTrip.volume.data, original.data)).toBe(true);
        }
        expect(roundTrip.volume.get(0, 0, 0)).toBe(true);
        expect(roundTrip.volume.get(2, 1, 1)).toBe(true);
        expect(roundTrip.volume.get(1, 0, 0)).toBe(false);
    });
});
