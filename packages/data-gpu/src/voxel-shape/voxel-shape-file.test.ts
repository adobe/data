// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { DenseVolume } from "@adobe/data/volume";
import { definitions } from "./voxel-shape-definitions.js";
import {
    parseVoxelShapeFile,
    serializeVoxelShapeFile,
    authoredSpan,
    VOXEL_CELL_EXTENT,
} from "./voxel-shape-file.js";
import { volumeContentKey } from "./volume-content-key.js";

describe("voxel-shape-file", () => {
    it("round-trips solidCube through JSON", () => {
        const volume = definitions.solidCube();
        const file = serializeVoxelShapeFile(volume);
        const restored = parseVoxelShapeFile(file);
        expect(volumeContentKey(restored)).toBe(volumeContentKey(volume));
    });

    it.each(Object.keys(definitions) as (keyof typeof definitions)[])(
        "round-trips %s",
        (name) => {
            const volume = definitions[name]();
            const restored = parseVoxelShapeFile(serializeVoxelShapeFile(volume));
            expect(volumeContentKey(restored)).toBe(volumeContentKey(volume));
        },
    );

    it("parses decimal u32 words", () => {
        const volume = parseVoxelShapeFile({
            version: 1,
            size: [1, 1, 1],
            words: [1],
        });
        expect(DenseVolume.get(volume, 0, 0, 0)).toBe(true);
    });

    it("rejects wrong word count", () => {
        expect(() => parseVoxelShapeFile({
            version: 1,
            size: [4, 4, 4],
            words: [0],
        })).toThrow(/words length must be 2/);
    });

    it("rejects garbage high bits in the last word", () => {
        expect(() => parseVoxelShapeFile({
            version: 1,
            size: [1, 1, 1],
            words: [0xFFFF_FFFE],
        })).toThrow(/unused high bits/);
    });

    it("defines authored span from cell extent", () => {
        expect(VOXEL_CELL_EXTENT).toBe(0.5);
        expect(authoredSpan([4, 4, 4])).toEqual([2, 2, 2]);
    });
});
