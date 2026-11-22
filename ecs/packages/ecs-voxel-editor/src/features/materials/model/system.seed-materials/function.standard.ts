// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec4 } from "@adobe/ecs";
import type { StandardMaterial } from "./type.standard-material.js";

/** A standard material or paint. */
export function standard(name: string, baseColor: Vec4, metallic: number, roughness: number): StandardMaterial {
    return { name, baseColor, metallic, roughness };
}
