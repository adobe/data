import type { PropertiesJson } from "./properties-json.js";

const isNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

const isVec2 = (value: unknown): value is readonly [number, number] =>
    Array.isArray(value)
    && value.length === 2
    && isNumber(value[0])
    && isNumber(value[1]);

const isVec3 = (value: unknown): value is readonly [number, number, number] =>
    Array.isArray(value)
    && value.length === 3
    && isNumber(value[0])
    && isNumber(value[1])
    && isNumber(value[2]);

const isVec4 = (value: unknown): value is readonly [number, number, number, number] =>
    Array.isArray(value)
    && value.length === 4
    && isNumber(value[0])
    && isNumber(value[1])
    && isNumber(value[2])
    && isNumber(value[3]);

const isStressStrainCurveJson = (
    value: unknown,
): value is PropertiesJson["stressStrainCurve"] => {
    if (typeof value !== "object" || value === null) return false;
    const curve = value as Record<string, unknown>;
    return (
        isVec2(curve.tensileYieldStrainStress)
        && isVec2(curve.tensileFractureStrainStress)
        && isVec2(curve.compressiveYieldStrainStress)
        && isVec2(curve.compressiveFractureStrainStress)
    );
};

const readVec4 = (props: Record<string, unknown>): readonly [number, number, number, number] | null => {
    if (isVec4(props.baseColorFactor)) return props.baseColorFactor;
    if (isVec4(props.baseColor)) return props.baseColor;
    return null;
};

const readVec3 = (props: Record<string, unknown>): readonly [number, number, number] | null => {
    if (isVec3(props.emissiveFactor)) return props.emissiveFactor;
    if (isVec3(props.emissionRgb)) return props.emissionRgb;
    return null;
};

const readNumber = (props: Record<string, unknown>, ...keys: string[]): number | null => {
    for (const key of keys) {
        if (isNumber(props[key])) return props[key];
    }
    return null;
};

export const isPropertiesJson = (value: unknown): value is PropertiesJson => {
    if (typeof value !== "object" || value === null) return false;
    const props = value as Record<string, unknown>;
    return (
        readVec4(props) !== null
        && readVec3(props) !== null
        && isNumber(props.metallicFactor ?? props.metallic)
        && isNumber(props.roughnessFactor ?? props.roughness)
        && isNumber(props.irReflectance)
        && isNumber(props.irEmission)
        && isNumber(props.emissionMode)
        && isNumber(props.density)
        && isNumber(props.viscosity)
        && isNumber(props.heatCapacity ?? props.specificHeatCapacity)
        && isNumber(props.thermalConductivity)
        && isStressStrainCurveJson(props.stressStrainCurve)
        && isNumber(props.restitution)
    );
};
