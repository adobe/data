// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "@adobe/data/typed-buffer";
import { Boolean } from "@adobe/data/schema";
import { DenseVolume } from "@adobe/data/volume";
import { booleanVolumeMesh } from "./boolean-volume-mesh.js";
import { definitions } from "../../../../voxel-shape/voxel-shape-definitions.js";
import { volumeContentKey } from "../../../../voxel-shape/volume-content-key.js";

describe("booleanVolumeMesh", () => {
    it("should emit no geometry for an empty volume", () => {
        const data = createTypedBuffer(Boolean.schema, 8);
        const volume = DenseVolume.create({ size: [2, 2, 2], data });
        const mesh = booleanVolumeMesh(volume);
        expect(mesh.vertices.length).toBe(0);
        expect(mesh.indices.length).toBe(0);
    });

    it("should emit shell geometry for hollowFrame", () => {
        const mesh = booleanVolumeMesh(definitions.hollowFrame());
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.indices.length).toBeGreaterThan(0);
    });

    it("should produce identical keys for equivalent volumes", () => {
        const a = definitions.stairStep();
        const b = definitions.stairStep();
        expect(volumeContentKey(a)).toBe(volumeContentKey(b));
    });

    it("should differ between shape definitions", () => {
        expect(volumeContentKey(definitions.stairStep())).not.toBe(volumeContentKey(definitions.lCorner()));
    });

    it("should cull internal faces on a solid cube", () => {
        const volume = definitions.solidCube();
        const mesh = booleanVolumeMesh(volume);
        // 4x4x4 solid → 6 * 16 = 96 outer faces → 96 * 6 = 576 verts (2 tris × 3 verts)
        expect(mesh.indices.length).toBe(96 * 6);
    });

    it("should handle a single-voxel volume", () => {
        const data = createTypedBuffer(Boolean.schema, 1);
        data.set(0, true);
        const volume = DenseVolume.create({ size: [1, 1, 1], data });
        const mesh = booleanVolumeMesh(volume);
        expect(mesh.indices.length).toBe(36);
    });
});
