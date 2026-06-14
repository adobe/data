/** One material entry in a material library JSON file. */
export type PropertiesJson = {
    readonly baseColorFactor: readonly [number, number, number, number];
    readonly emissiveFactor: readonly [number, number, number];
    readonly metallicFactor: number;
    readonly roughnessFactor: number;
    readonly irReflectance: number;
    readonly irEmission: number;
    readonly emissionMode: number;
    readonly density: number;
    readonly viscosity: number;
    readonly heatCapacity: number;
    readonly thermalConductivity: number;
    readonly restitution: number;
    readonly friction?: number;
    readonly compliance?: number;
    readonly normalScale?: number;
    readonly occlusionStrength?: number;
    readonly stressStrainCurve: {
        readonly tensileYieldStrainStress: readonly [number, number];
        readonly tensileFractureStrainStress: readonly [number, number];
        readonly compressiveYieldStrainStress: readonly [number, number];
        readonly compressiveFractureStrainStress: readonly [number, number];
    };
};
