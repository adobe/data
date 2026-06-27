import { Vec2 } from "@adobe/data/math";
import { Schema } from "@adobe/data/schema";

/** Uniaxial bilinear σ–ε curve points. Each Vec2 is [engineering strain, stress MPa]. */
export const schema = {
    type: "object",
    layout: "packed",
    properties: {
        tensileYieldStrainStress: Vec2.schema,
        tensileFractureStrainStress: Vec2.schema,
        compressiveYieldStrainStress: Vec2.schema,
        compressiveFractureStrainStress: Vec2.schema,
    },
    required: [
        "tensileYieldStrainStress",
        "tensileFractureStrainStress",
        "compressiveYieldStrainStress",
        "compressiveFractureStrainStress",
    ],
} as const satisfies Schema;
