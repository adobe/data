// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { signedDistance } from "./signed-distance.js";

export const isPointBehind = (plane: Plane, point: Vec3): boolean => 
    signedDistance(plane, point) < 0;
