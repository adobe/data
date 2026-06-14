import type { MaterialDefinition } from "./material-definition.js";
import { StressStrainCurve } from "./stress-strain-curve/stress-strain-curve.js";

/** Shared defaults for solid materials missing optional simulation / PBR fields. */
export const solidDefaults = {
    friction: 0.5,
    compliance: 1e-8,
    normalScale: 1,
    occlusionStrength: 1,
    viscosity: 0,
    thermalConductivity: 0,
    irReflectance: 0,
    irEmission: 0,
    emissionMode: 0,
    baseColorUrl: "",
    metallicRoughnessUrl: "",
    normalUrl: "",
    occlusionUrl: "",
    emissiveUrl: "",
    stressStrainCurve: StressStrainCurve.create({
        tensileYieldStrainStress: [0, 0],
        tensileFractureStrainStress: [0, 0],
        compressiveYieldStrainStress: [0, 0],
        compressiveFractureStrainStress: [0, 0],
    }),
} as const satisfies Partial<MaterialDefinition>;
