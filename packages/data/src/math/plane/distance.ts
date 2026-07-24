// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { signedDistance } from "./signed-distance.js";

export const distance = (plane: Plane, point: Vec3): number => 
    Math.abs(signedDistance(plane, point));
