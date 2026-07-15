import type { Vec3, Vec4 } from "@adobe/data/math";
import type { StressStrainCurve } from "./stress-strain-curve/stress-strain-curve.js";

/** One row of the `Material` archetype — one entity per material type. */
export type Material = {
    readonly name: string;

    // rigid-body physics
    readonly density: number;
    readonly restitution: number;
    readonly friction: number;
    readonly compliance: number;
    readonly heatCapacity: number;

    // simulation (thermal / fluid / mechanical)
    readonly viscosity: number;
    readonly thermalConductivity: number;
    readonly stressStrainCurve: StressStrainCurve;

    // visible PBR factors
    readonly baseColorFactor: Vec4;
    readonly emissiveFactor: Vec3;
    readonly metallicFactor: number;
    readonly roughnessFactor: number;
    readonly normalScale: number;
    readonly occlusionStrength: number;
    readonly irReflectance: number;
    readonly irEmission: number;
    readonly emissionMode: number;

    // texture sources ("" = factor-only / neutral GPU layer)
    readonly baseColorUrl: string;
    readonly metallicRoughnessUrl: string;
    readonly normalUrl: string;
    readonly occlusionUrl: string;
    readonly emissiveUrl: string;
};

export * as Material from "./public.js";
