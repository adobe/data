// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat, Vec3 } from "@adobe/data/math";
import { orbitCamera, pbrIbl, pbrModelLoader } from "@adobe/data-gpu";

export const pbrIblInstancedPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader, orbitCamera),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            grid: number;
            spacing: number;
        }): number {
            if (args.envUrl !== undefined) t.resources.iblEnvironmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = t.archetypes.Geometry.insert({ pbrModelUrl: args.modelUrl });
            const offset = (args.grid - 1) / 2;
            for (let x = 0; x < args.grid; x++) {
                for (let z = 0; z < args.grid; z++) {
                    t.archetypes.Model.insert({
                        pbrGeometryRef: geoId,
                        position: [(x - offset) * args.spacing, 0, (z - offset) * args.spacing],
                        rotation: Quat.identity,
                        scale: [1, 1, 1],
                        visible: true,
                        parent: 0,
                        animationSkeletonRef: 0,
                    });
                }
            }
            // Fit around the grid: extra radius for the grid extent, center at origin.
            t.resources.orbitFitGeometryRef = geoId;
            t.resources.orbitFitRadiusOffset = offset * args.spacing;
            t.resources.orbitFitRadiusFactor = 2;
            t.resources.orbitFitHeightFactor = 0.5;
            t.resources.orbitFitCenter = [0, 0, 0];
            return geoId;
        },
    },
});

export type PbrIblInstancedService = Database.Plugin.ToDatabase<typeof pbrIblInstancedPlugin>;
