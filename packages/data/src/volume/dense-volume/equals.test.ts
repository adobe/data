// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "../../typed-buffer/index.js";
import { Boolean } from "../../schema/boolean/index.js";
import type { DenseVolume } from "./dense-volume.js";
import { create } from "./create.js";
import { equals } from "./equals.js";
import { get } from "./get.js";
import { getCoordinates } from "./get-coordinates.js";
import { getIndex } from "./get-index.js";
import { is } from "./is.js";

describe("DenseVolume.equals", () => {
    describe("same reference", () => {
        it("should return true for identical references", () => {
            const volume: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            expect(equals(volume, volume)).toBe(true);
        });
    });

    describe("structural differences", () => {
        it("should return false for different sizes", () => {
            const volume1: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            const volume2: DenseVolume<boolean> = {
                type: "dense",
                size: [3, 3, 3],
                data: createTypedBuffer(Boolean.schema, 27),
            };

            expect(equals(volume1, volume2)).toBe(false);
        });

        it("should return false for different data", () => {
            const volume1: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            const volume2: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            volume1.data.set(0, true);
            volume2.data.set(0, false);

            expect(equals(volume1, volume2)).toBe(false);
        });
    });

    describe("identical volumes", () => {
        it("should return true for volumes with same size and data", () => {
            const volume1: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            const volume2: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            volume1.data.set(0, true);
            volume1.data.set(1, true);
            volume2.data.set(0, true);
            volume2.data.set(1, true);

            expect(equals(volume1, volume2)).toBe(true);
        });

        it("should return true for empty volumes", () => {
            const volume1: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            const volume2: DenseVolume<boolean> = {
                type: "dense",
                size: [2, 2, 2],
                data: createTypedBuffer(Boolean.schema, 8),
            };

            expect(equals(volume1, volume2)).toBe(true);
        });
    });
});

describe("DenseVolume accessors", () => {
    it("should compute linear indices and coordinates", () => {
        const volume: DenseVolume<boolean> = {
            type: "dense",
            size: [3, 2, 2],
            data: createTypedBuffer(Boolean.schema, 12),
        };

        expect(getIndex(volume, 1, 1, 1)).toBe(10);
        expect(getCoordinates(volume, 7)).toEqual([1, 0, 1]);
        expect(getCoordinates(volume, 10)).toEqual([1, 1, 1]);
    });

    it("should get voxel values by coordinate", () => {
        const volume: DenseVolume<boolean> = {
            type: "dense",
            size: [2, 2, 2],
            data: createTypedBuffer(Boolean.schema, 8),
        };

        volume.data.set(getIndex(volume, 1, 0, 0), true);
        expect(get(volume, 1, 0, 0)).toBe(true);
        expect(get(volume, 0, 0, 0)).toBe(false);
        expect(get(volume, -1, 0, 0)).toBeNull();
        expect(get(volume, 2, 0, 0)).toBeNull();
    });

    it("should identify dense volumes", () => {
        const volume = create({
            size: [1, 1, 1],
            data: createTypedBuffer(Boolean.schema, 1),
        });
        expect(is(volume)).toBe(true);
        expect(is({ type: "column" })).toBe(false);
    });
});
