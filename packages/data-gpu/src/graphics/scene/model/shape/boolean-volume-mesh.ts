// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { DenseVolume as DenseVolumeOps } from "@adobe/data/volume";
import type { ShapeMesh } from "./shape-mesh.js";

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

function pushVertex(
    out: number[],
    px: number, py: number, pz: number,
    nx: number, ny: number, nz: number,
): void {
    const tx = ny === 0 && nz !== 0 ? 1 : 0;
    const ty = 0;
    const tz = nx !== 0 ? 0 : 1;
    out.push(px, py, pz, nx, ny, nz, tx, ty, tz, 1, 0, 0);
}

function setVertexPosition(
    out: number[],
    x: number, y: number, z: number,
    vertexIndex: number,
    x1: number, y1: number, z1: number,
    cx: number, cy: number, cz: number,
): void {
    let px: number, py: number, pz: number;
    switch (vertexIndex) {
        case 0: px = x; py = y; pz = z; break;
        case 1: px = x1; py = y; pz = z; break;
        case 2: px = x1; py = y1; pz = z; break;
        case 3: px = x; py = y1; pz = z; break;
        case 4: px = x; py = y; pz = z1; break;
        case 5: px = x1; py = y; pz = z1; break;
        case 6: px = x1; py = y1; pz = z1; break;
        case 7: px = x; py = y1; pz = z1; break;
        default: px = x; py = y; pz = z; break;
    }
    pushVertex(out, px - cx, py - cy, pz - cz, 0, 0, 0);
}

function getNormalIndex(dx: number, dy: number, dz: number): number {
    if (dx === 1) return 0;
    if (dx === -1) return 1;
    if (dy === 1) return 2;
    if (dy === -1) return 3;
    if (dz === 1) return 4;
    if (dz === -1) return 5;
    return 0;
}

const isSolid = (volume: DenseVolume<boolean>, x: number, y: number, z: number): boolean =>
    DenseVolumeOps.get(volume, x, y, z) === true;

/** Face-culled unit-voxel mesh from a boolean dense volume, centered at the origin. */
export const booleanVolumeMesh = (volume: DenseVolume<boolean>): ShapeMesh => {
    const [width, height, depth] = volume.size;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const cz = depth * 0.5;

    const faces: number[] = [];
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

                    const offset = faceCount * 6;
                    faces[offset + 0] = x;
                    faces[offset + 1] = y;
                    faces[offset + 2] = z;
                    faces[offset + 3] = dx;
                    faces[offset + 4] = dy;
                    faces[offset + 5] = dz;
                    faceCount++;
                }
            }
        }
    }

    const verts: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < faceCount; i++) {
        const offset = i * 6;
        const x = faces[offset + 0]!;
        const y = faces[offset + 1]!;
        const z = faces[offset + 2]!;
        const dx = faces[offset + 3]!;
        const dy = faces[offset + 4]!;
        const dz = faces[offset + 5]!;
        const nx = dx;
        const ny = dy;
        const nz = dz;

        const x1 = x + 1;
        const y1 = y + 1;
        const z1 = z + 1;
        const quad = FACE_QUADS[getNormalIndex(dx, dy, dz)]!;

        const patchNormal = (base: number): void => {
            verts[base + 3] = nx;
            verts[base + 4] = ny;
            verts[base + 5] = nz;
        };

        const base = verts.length / 12;
        setVertexPosition(verts, x, y, z, quad[0]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        setVertexPosition(verts, x, y, z, quad[1]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        setVertexPosition(verts, x, y, z, quad[2]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        indices.push(base, base + 1, base + 2);

        const base2 = verts.length / 12;
        setVertexPosition(verts, x, y, z, quad[0]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        setVertexPosition(verts, x, y, z, quad[2]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        setVertexPosition(verts, x, y, z, quad[3]!, x1, y1, z1, cx, cy, cz);
        patchNormal(verts.length - 12);
        indices.push(base2, base2 + 1, base2 + 2);
    }

    return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
};
