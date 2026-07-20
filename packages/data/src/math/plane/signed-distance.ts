// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

export const signedDistance = (plane: Plane, point: Vec3): number => 
    Vec3Namespace.dot(plane.normal, point) - plane.distance;
