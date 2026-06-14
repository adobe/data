// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Algorithm ported from cryos material-volume-to-vertex-data.ts (reference only).

import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { DenseVolume as DenseVolumeOps } from "@adobe/data/volume";
import type { ShapeMesh } from "./shape-mesh.js";

const FLOATS_PER_VERTEX = 12;
const VERTS_PER_FACE = 6;
const FACE_STRIDE = 6;

const DIRECTIONS: readonly Vec3[] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1],
] as const;

const FACE_QUADS: readonly number[][] = [
    [2, 6, 5, 1],
    [4, 7, 3, 0],
    [3, 7, 6, 2],
    [1, 5, 4, 0],
    [5, 6, 7, 4],
    [3, 2, 1, 0],
];

const getNormalIndex = (dx: number, dy: number, dz: number): number => {
    if (dx === 1) return 0;
    if (dx === -1) return 1;
    if (dy === 1) return 2;
    if (dy === -1) return 3;
    if (dz === 1) return 4;
    if (dz === -1) return 5;
    return 0;
};

const isSolid = (volume: DenseVolume<boolean>, x: number, y: number, z: number): boolean =>
    DenseVolumeOps.get(volume, x, y, z) === true;

const cornerPosition = (
    position: [number, number, number],
    x: number, y: number, z: number,
    vertexIndex: number,
    x1: number, y1: number, z1: number,
): void => {
    switch (vertexIndex) {
        case 0: position[0] = x; position[1] = y; position[2] = z; break;
        case 1: position[0] = x1; position[1] = y; position[2] = z; break;
        case 2: position[0] = x1; position[1] = y1; position[2] = z; break;
        case 3: position[0] = x; position[1] = y1; position[2] = z; break;
        case 4: position[0] = x; position[1] = y; position[2] = z1; break;
        case 5: position[0] = x1; position[1] = y; position[2] = z1; break;
        case 6: position[0] = x1; position[1] = y1; position[2] = z1; break;
        case 7: position[0] = x; position[1] = y1; position[2] = z1; break;
        default: position[0] = x; position[1] = y; position[2] = z; break;
    }
};

const writeStandardVertex = (
    out: Float32Array,
    offset: number,
    px: number, py: number, pz: number,
    nx: number, ny: number, nz: number,
): void => {
    const tx = ny === 0 && nz !== 0 ? 1 : 0;
    const ty = 0;
    const tz = nx !== 0 ? 0 : 1;
    out[offset] = px;
    out[offset + 1] = py;
    out[offset + 2] = pz;
    out[offset + 3] = nx;
    out[offset + 4] = ny;
    out[offset + 5] = nz;
    out[offset + 6] = tx;
    out[offset + 7] = ty;
    out[offset + 8] = tz;
    out[offset + 9] = 1;
    out[offset + 10] = 0;
    out[offset + 11] = 0;
};

/** Face-culled unit-voxel mesh from a boolean dense volume, centered at the origin. */
export const booleanVolumeMesh = (volume: DenseVolume<boolean>): ShapeMesh => {
    const [width, height, depth] = volume.size;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const cz = depth * 0.5;

    const estimatedFaces = width * height * depth * 6;
    const faces = new Int32Array(estimatedFaces * FACE_STRIDE);
    let faceCount = 0;

    for (let z = 0; z < depth; z++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!isSolid(volume, x, y, z)) continue;

                for (const [dx, dy, dz] of DIRECTIONS) {
                    const nx = x + dx;
                    const ny = y + dy;
                    const nz = z + dz;
                    const boundary = nx < 0 || nx >= width || ny < 0 || ny >= height || nz < 0 || nz >= depth;
                    if (!boundary && isSolid(volume, nx, ny, nz)) continue;

                    const faceOffset = faceCount * FACE_STRIDE;
                    faces[faceOffset] = x;
                    faces[faceOffset + 1] = y;
                    faces[faceOffset + 2] = z;
                    faces[faceOffset + 3] = dx;
                    faces[faceOffset + 4] = dy;
                    faces[faceOffset + 5] = dz;
                    faceCount++;
                }
            }
        }
    }

    if (faceCount === 0) {
        return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }

    const vertexCount = faceCount * VERTS_PER_FACE;
    const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
    const indices = new Uint16Array(vertexCount);

    const position: [number, number, number] = [0, 0, 0];
    let vertexIndex = 0;
    let indexOffset = 0;

    for (let i = 0; i < faceCount; i++) {
        const faceOffset = i * FACE_STRIDE;
        const x = faces[faceOffset]!;
        const y = faces[faceOffset + 1]!;
        const z = faces[faceOffset + 2]!;
        const dx = faces[faceOffset + 3]!;
        const dy = faces[faceOffset + 4]!;
        const dz = faces[faceOffset + 5]!;
        const nx = dx;
        const ny = dy;
        const nz = dz;

        const x1 = x + 1;
        const y1 = y + 1;
        const z1 = z + 1;
        const quad = FACE_QUADS[getNormalIndex(dx, dy, dz)]!;

        const writeCorner = (cornerIndex: number): void => {
            cornerPosition(position, x, y, z, cornerIndex, x1, y1, z1);
            writeStandardVertex(
                vertices,
                vertexIndex * FLOATS_PER_VERTEX,
                position[0] - cx,
                position[1] - cy,
                position[2] - cz,
                nx, ny, nz,
            );
            indices[indexOffset++] = vertexIndex;
            vertexIndex++;
        };

        writeCorner(quad[0]!);
        writeCorner(quad[1]!);
        writeCorner(quad[2]!);
        writeCorner(quad[0]!);
        writeCorner(quad[2]!);
        writeCorner(quad[3]!);
    }

    return { vertices, indices };
};
