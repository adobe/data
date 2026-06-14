/**
 * One-off: flatten mechs definitions.ts (materialFlags packs) → data-gpu flat definitions.ts
 * Run: node scripts/flatten-mechs-definitions.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(
    join(root, "src/material/definitions.ts"),
    "utf8",
);

const parseFlags = (block) => {
    const num = (key) => {
        const m = block.match(new RegExp(`${key}:\\s*([\\d.]+)`));
        return m ? m[1] : "0";
    };
    return `        metallicFactor: ${num("metallic")},\n        roughnessFactor: ${num("roughness")},\n        irReflectance: ${num("irReflectance")},\n        irEmission: ${num("irEmission")},\n        emissionMode: ${num("emissionMode")},\n        restitution: ${num("restitution")},`;
};

let out = src
    .replace(
        /import type \{ MaterialDefinition \} from "\.\/material-definition\.js";\nimport \{ MaterialFlags \} from "\.\.\/material-flags\/material-flags\.js";\nimport \{ StressStrainCurve \} from "\.\.\/stress-strain-curve\/stress-strain-curve\.js";/,
        `import type { MaterialDefinition } from "./material-definition.js";\nimport { StressStrainCurve } from "./stress-strain-curve/stress-strain-curve.js";\n\nconst defaultSolid = {\n    friction: 0.5,\n    compliance: 1e-8,\n    normalScale: 1,\n    occlusionStrength: 1,\n    baseColorUrl: "",\n    metallicRoughnessUrl: "",\n    normalUrl: "",\n    occlusionUrl: "",\n    emissiveUrl: "",\n} as const satisfies Partial<MaterialDefinition>;`,
    )
    .replace(/StressStrainCurve/g, "StressStrainCurve")
    .replace(/\.\.\/stress-strain-curve\/stress-strain-curve\.js/g, "./stress-strain-curve/stress-strain-curve.js")
    .replace(/baseColor:/g, "baseColorFactor:")
    .replace(/emissionRgb:/g, "emissiveFactor:")
    .replace(/specificHeatCapacity:/g, "heatCapacity:")
    .replace(
        /const metaMaterialBase: Omit<MaterialDefinition, "baseColor"> = \{[\s\S]*?\};/,
        `const metaMaterialBase: Omit<MaterialDefinition, "baseColorFactor"> = {
    metallicFactor: 0.8,
    roughnessFactor: 0.2,
    irReflectance: 0.5,
    irEmission: 0,
    emissionMode: 0,
    restitution: 0.35,
    emissiveFactor: [0, 0, 0],
    density: 1200,
    viscosity: 0,
    heatCapacity: Number.POSITIVE_INFINITY,
    thermalConductivity: 100,
    ...defaultSolid,
    stressStrainCurve: StressStrainCurve.create({
        tensileYieldStrainStress: [0.01333, 40],
        tensileFractureStrainStress: [0.08, 48],
        compressiveYieldStrainStress: [-0.015, -45],
        compressiveFractureStrainStress: [-0.09, -52],
    }),
};`,
    );

out = out.replace(
    /materialFlags: MaterialFlags\.create\(\{[\s\S]*?\}\),?\n/g,
    (match) => parseFlags(match) + "\n",
);

// Spread defaultSolid into entries that use ...noSolidCurve (fluids)
out = out.replace(
    /(\.\.\.noSolidCurve,)/g,
    "...defaultSolid,\n        ...noSolidCurve,",
);

writeFileSync(join(root, "src/material/definitions.ts"), out);
console.log("Wrote src/material/definitions.ts");
