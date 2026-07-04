import type { Vec2 } from "@adobe/data/math";
import type { StressStrainCurve } from "./stress-strain-curve.js";

export const create = (args: {
    readonly tensileYieldStrainStress: Vec2;
    readonly tensileFractureStrainStress: Vec2;
    readonly compressiveYieldStrainStress: Vec2;
    readonly compressiveFractureStrainStress: Vec2;
}): StressStrainCurve => args;
