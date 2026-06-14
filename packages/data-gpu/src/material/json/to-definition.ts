import { solidDefaults } from "../material-defaults.js";
import type { MaterialDefinition } from "../material-definition.js";
import { StressStrainCurve } from "../stress-strain-curve/stress-strain-curve.js";
import type { PropertiesJson } from "./properties-json.js";

export const toDefinition = (props: PropertiesJson): MaterialDefinition => ({
    baseColorFactor: [...props.baseColorFactor],
    emissiveFactor: [...props.emissiveFactor],
    metallicFactor: props.metallicFactor,
    roughnessFactor: props.roughnessFactor,
    irReflectance: props.irReflectance,
    irEmission: props.irEmission,
    emissionMode: props.emissionMode,
    restitution: props.restitution,
    density: props.density,
    viscosity: props.viscosity,
    heatCapacity: props.heatCapacity,
    thermalConductivity: props.thermalConductivity,
    friction: props.friction ?? solidDefaults.friction,
    compliance: props.compliance ?? solidDefaults.compliance,
    normalScale: props.normalScale ?? solidDefaults.normalScale,
    occlusionStrength: props.occlusionStrength ?? solidDefaults.occlusionStrength,
    baseColorUrl: "",
    metallicRoughnessUrl: "",
    normalUrl: "",
    occlusionUrl: "",
    emissiveUrl: "",
    stressStrainCurve: StressStrainCurve.create({
        tensileYieldStrainStress: [...props.stressStrainCurve.tensileYieldStrainStress],
        tensileFractureStrainStress: [...props.stressStrainCurve.tensileFractureStrainStress],
        compressiveYieldStrainStress: [...props.stressStrainCurve.compressiveYieldStrainStress],
        compressiveFractureStrainStress: [...props.stressStrainCurve.compressiveFractureStrainStress],
    }),
});

/** Accept legacy JSON field names (baseColor, metallic, specificHeatCapacity, …). */
export const toDefinitionFromUnknown = (props: Record<string, unknown>): MaterialDefinition | null => {
    const baseColorFactor = props.baseColorFactor ?? props.baseColor;
    const emissiveFactor = props.emissiveFactor ?? props.emissionRgb;
    const metallicFactor = props.metallicFactor ?? props.metallic;
    const roughnessFactor = props.roughnessFactor ?? props.roughness;
    const heatCapacity = props.heatCapacity ?? props.specificHeatCapacity;
    if (
        !Array.isArray(baseColorFactor) || baseColorFactor.length !== 4
        || !Array.isArray(emissiveFactor) || emissiveFactor.length !== 3
        || typeof metallicFactor !== "number"
        || typeof roughnessFactor !== "number"
        || typeof heatCapacity !== "number"
        || typeof props.stressStrainCurve !== "object"
    ) {
        return null;
    }
    return toDefinition({
        baseColorFactor: baseColorFactor as unknown as PropertiesJson["baseColorFactor"],
        emissiveFactor: emissiveFactor as unknown as PropertiesJson["emissiveFactor"],
        metallicFactor: metallicFactor as number,
        roughnessFactor: roughnessFactor as number,
        irReflectance: (props.irReflectance as number) ?? 0,
        irEmission: (props.irEmission as number) ?? 0,
        emissionMode: (props.emissionMode as number) ?? 0,
        density: props.density as number,
        viscosity: (props.viscosity as number) ?? 0,
        heatCapacity: heatCapacity as number,
        thermalConductivity: (props.thermalConductivity as number) ?? 0,
        restitution: (props.restitution as number) ?? 0,
        friction: props.friction as number | undefined,
        compliance: props.compliance as number | undefined,
        stressStrainCurve: props.stressStrainCurve as PropertiesJson["stressStrainCurve"],
    });
};
