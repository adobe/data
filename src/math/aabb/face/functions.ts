// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { AabbFace } from "./index.js";
import type { Vec3 } from "../../vec3/index.js";
import type { Aabb } from "../index.js";
import { Aabb as AabbNamespace } from "../index.js";

/**
 * AABB face direction constants for cube faces (as bit flags)
 */
export const POS_Z = 1 << 0;  // 1
export const POS_X = 1 << 1;  // 2
export const NEG_Z = 1 << 2;  // 4
export const NEG_X = 1 << 3;  // 8
export const POS_Y = 1 << 4;  // 16
export const NEG_Y = 1 << 5;  // 32
export const ALL = POS_Z | POS_X | NEG_Z | NEG_X | POS_Y | NEG_Y;
export const NONE = 0;

const FACES = [POS_Z, POS_X, NEG_Z, NEG_X, POS_Y, NEG_Y];

/**
 * AABB face direction names for debugging/logging
 */
const FACE_NAMES = new Map<number, string>([
    [POS_Z, 'POS_Z'],
    [POS_X, 'POS_X'],
    [NEG_Z, 'NEG_Z'],
    [NEG_X, 'NEG_X'],
    [POS_Y, 'POS_Y'],
    [NEG_Y, 'NEG_Y'],
]);

/**
 * Get the AABB face name for debugging/logging
 */
export const getName = (face: AabbFace): string => {
    return FACE_NAMES.get(face) ?? `Unknown(${face})`;
};

/**
 * Get the normal vector for a given AABB face
 */
export const getNormal = (face: AabbFace): Vec3 => {
    switch (face) {
        case POS_Z: return [0, 0, 1];
        case NEG_Z: return [0, 0, -1];
        case POS_X: return [1, 0, 0];
        case NEG_X: return [-1, 0, 0];
        case POS_Y: return [0, 1, 0];
        case NEG_Y: return [0, -1, 0];
        default: throw new Error(`Invalid face index: ${face}`);
    }
};

export function* getFaces(face: AabbFace): IterableIterator<AabbFace> {
    for (const f of FACES) {
        if (face & f) {
            yield f;
        }
    }
}

/**
 * Get the opposite AABB face
 */
export const getOpposite = (face: AabbFace): AabbFace => {
    switch (face) {
        case POS_Z: return NEG_Z;
        case NEG_Z: return POS_Z;
        case POS_X: return NEG_X;
        case NEG_X: return POS_X;
        case POS_Y: return NEG_Y;
        case NEG_Y: return POS_Y;
        default: throw new Error(`Invalid face index: ${face}`);
    }
};

/**
 * Check if two AABB faces are opposite
 */
export const isOpposite = (face1: AabbFace, face2: AabbFace): boolean => {
    return getOpposite(face1) === face2;
};

/**
 * Get all AABB faces adjacent to the given face (faces that share an edge)
 */
export const getAdjacent = (face: AabbFace): readonly AabbFace[] => {
    switch (face) {
        case POS_Z:
        case NEG_Z:
            return [POS_X, NEG_X, POS_Y, NEG_Y];
        case POS_X:
        case NEG_X:
            return [POS_Z, NEG_Z, POS_Y, NEG_Y];
        case POS_Y:
        case NEG_Y:
            return [POS_Z, NEG_Z, POS_X, NEG_X];
        default:
            throw new Error(`Invalid face index: ${face}`);
    }
};

/**
 * Check if two AABB faces are adjacent (share an edge)
 */
export const isAdjacent = (face1: AabbFace, face2: AabbFace): boolean => {
    return getAdjacent(face1).includes(face2);
};

/**
 * Determines which AABB face a position is closest to.
 * Assumes the position is in normalized coordinate space - a cube with size 1 centered on the origin.
 * @param position World position of the intersection point
 * @param aabb Bounding box of the cube
 * @returns AabbFace flag: 1=POS_Z, 2=POS_X, 4=NEG_Z, 8=NEG_X, 16=POS_Y, 32=NEG_Y
 */
export const fromPosition = (position: Vec3, aabb: Aabb = AabbNamespace.unit): AabbFace => {
    const aabbCenter = AabbNamespace.center(aabb);
    const localPos = [
        position[0] - aabbCenter[0],
        position[1] - aabbCenter[1],
        position[2] - aabbCenter[2]
    ];

    // Find the face with the largest absolute coordinate (closest to cube surface)
    const absX = Math.abs(localPos[0]);
    const absY = Math.abs(localPos[1]);
    const absZ = Math.abs(localPos[2]);

    if (absX >= absY && absX >= absZ) {
        // X-axis face (NEG_X or POS_X)
        return localPos[0] > 0 ? POS_X : NEG_X;
    } else if (absY >= absZ) {
        // Y-axis face (NEG_Y or POS_Y)
        return localPos[1] > 0 ? POS_Y : NEG_Y;
    } else {
        // Z-axis face (NEG_Z or POS_Z)
        return localPos[2] > 0 ? POS_Z : NEG_Z;
    }
};

