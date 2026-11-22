// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec4 } from "@adobe/ecs";

/** A standard material or paint, as seeding spawns it. */
export type StandardMaterial = {
    readonly name: string;
    readonly baseColor: Vec4;
    readonly metallic: number;
    readonly roughness: number;
};
