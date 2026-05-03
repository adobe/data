// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../vec3/index.js";
import type { Face } from "./face.js";
import { FACE_NORMALS } from "./internals.js";

/** Outward unit normal for a single-face bit */
export const getNormal = (face: Face): Vec3 => {
    const normal = FACE_NORMALS.get(face);
    if (normal === undefined) {
        throw new Error(`Invalid face index: ${face}`);
    }
    return normal;
};
