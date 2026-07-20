// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Plane } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { epsilon } from "../constants.js";
import { signedDistance } from "./signed-distance.js";

export const containsPoint = (plane: Plane, point: Vec3): boolean => 
    Math.abs(signedDistance(plane, point)) < epsilon;
