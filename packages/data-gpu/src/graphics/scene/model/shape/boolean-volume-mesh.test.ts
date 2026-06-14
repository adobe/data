// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import type { Vec3 } from "@adobe/data/math";
import { createTypedBuffer } from "@adobe/data/typed-buffer";
import { Boolean } from "@adobe/data/schema";
import { DenseVolume } from "@adobe/data/volume";
import { booleanVolumeMesh } from "./boolean-volume-mesh.js";
import { definitions } from "../../../../voxel-shape/voxel-shape-definitions.js";
import { volumeContentKey } from "../../../../voxel-shape/volume-content-key.js";
import type { ShapeMesh } from "./shape-mesh.js";

const FLOATS_PER_VERTEX = 12;
const VERTS_PER_FACE = 6;

const definitionNames = Object.keys(definitions);

const solidVolume = (size: Vec3, solid: (x: number, y: number, z: number) => boolean) => {
    const [width, height, depth] = size;
    const data = createTypedBuffer(Boolean.schema, width * height * depth);
    const volume = DenseVolume.create({ size, data });
    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (solid(x, y, z)) {
                    data.set(DenseVolume.getIndex(volume, x, y, z), true);
                }
            }
        }
    }
    return volume;
};

const readPosition = (mesh: ShapeMesh, vertexIndex: number): Vec3 => {
    const o = vertexIndex * FLOATS_PER_VERTEX;
    return [mesh.vertices[o]!, mesh.vertices[o + 1]!, mesh.vertices[o + 2]!];
};

const readNormal = (mesh: ShapeMesh, vertexIndex: number): Vec3 => {
    const o = vertexIndex * FLOATS_PER_VERTEX + 3;
    return [mesh.vertices[o]!, mesh.vertices[o + 1]!, mesh.vertices[o + 2]!];
};

const bottomFaceVertices = (mesh: ShapeMesh): Vec3[] => {
    const vertexCount = mesh.vertices.length / FLOATS_PER_VERTEX;
    const out: Vec3[] = [];
    for (let i = 0; i < vertexCount; i++) {
        const normal = readNormal(mesh, i);
        if (normal[0] === 0 && normal[1] === -1 && normal[2] === 0) {
            out.push(readPosition(mesh, i));
        }
    }
    return out;
};

const signedAreaXZ = (v0: Vec3, v1: Vec3, v2: Vec3): number => {
    const dx1 = v1[0] - v0[0];
    const dz1 = v1[2] - v0[2];
    const dx2 = v2[0] - v0[0];
    const dz2 = v2[2] - v0[2];
    return dx1 * dz2 - dz1 * dx2;
};

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
        const mesh = booleanVolumeMesh(definitions.solidCube());
        expect(mesh.indices.length).toBe(96 * VERTS_PER_FACE);
    });

    it("should handle a single-voxel volume with exact vertex and index counts", () => {
        const volume = solidVolume([1, 1, 1], () => true);
        const mesh = booleanVolumeMesh(volume);
        expect(mesh.indices.length).toBe(36);
        expect(mesh.vertices.length).toBe(36 * FLOATS_PER_VERTEX);
    });

    it("should cull the shared face between two adjacent solid voxels", () => {
        const separate = booleanVolumeMesh(solidVolume([1, 1, 1], () => true)).indices.length
            + booleanVolumeMesh(solidVolume([1, 1, 1], () => true)).indices.length;
        const joined = booleanVolumeMesh(solidVolume([2, 1, 1], (x) => x === 0 || x === 1)).indices.length;
        expect(joined).toBeLessThan(separate);
        expect(joined).toBe(10 * VERTS_PER_FACE);
    });

    it("should emit bottom faces with counter-clockwise winding in centered space", () => {
        const mesh = booleanVolumeMesh(solidVolume([1, 1, 1], () => true));
        const bottomVertices = bottomFaceVertices(mesh);
        expect(bottomVertices.length).toBe(VERTS_PER_FACE);

        for (const vertex of bottomVertices) {
            expect(vertex[1]).toBeCloseTo(-0.5, 5);
        }

        const tri1 = [bottomVertices[0]!, bottomVertices[1]!, bottomVertices[2]!];
        const tri2 = [bottomVertices[3]!, bottomVertices[4]!, bottomVertices[5]!];
        expect(signedAreaXZ(tri1[0], tri1[1], tri1[2])).toBeGreaterThan(0);
        expect(signedAreaXZ(tri2[0], tri2[1], tri2[2])).toBeGreaterThan(0);
    });

    it("should emit valid StandardVertex layout on the first vertex", () => {
        const mesh = booleanVolumeMesh(definitions.solidCube());
        const normal = readNormal(mesh, 0);
        const normalLength = Math.hypot(normal[0], normal[1], normal[2]);
        expect(normalLength).toBeCloseTo(1, 5);

        for (let i = 6; i < FLOATS_PER_VERTEX; i++) {
            expect(Number.isFinite(mesh.vertices[i]!)).toBe(true);
        }
    });

    it.each(definitionNames)("should emit stable non-zero geometry for %s", (name) => {
        const mesh = booleanVolumeMesh(definitions[name as keyof typeof definitions]());
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.vertices.length).toBeGreaterThan(0);
        expect(mesh.vertices.length % FLOATS_PER_VERTEX).toBe(0);
        expect(mesh.indices.length % 3).toBe(0);
    });

    it("should emit more shell faces for hollowFrame than solidCube", () => {
        const solid = booleanVolumeMesh(definitions.solidCube());
        const hollow = booleanVolumeMesh(definitions.hollowFrame());
        expect(hollow.indices.length).toBeGreaterThan(solid.indices.length);
    });

    it("should emit fewer faces for stairStep than solidCube", () => {
        const solid = booleanVolumeMesh(definitions.solidCube());
        const stairs = booleanVolumeMesh(definitions.stairStep());
        expect(stairs.indices.length).toBeLessThan(solid.indices.length);
    });

    it("should preallocate exact output sizes with no trailing slack", () => {
        const mesh = booleanVolumeMesh(definitions.stairStep());
        const vertexCount = mesh.indices.length;
        expect(mesh.vertices.length).toBe(vertexCount * FLOATS_PER_VERTEX);
    });
});
