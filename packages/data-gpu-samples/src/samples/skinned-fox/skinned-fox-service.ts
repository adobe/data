// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat, Vec3 } from "@adobe/data/math";
import { orbitCamera, pbrIbl, pbrModelLoader, pbrSkinning } from "@adobe/data-gpu";

export const skinnedFoxPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader, pbrSkinning, orbitCamera),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            if (args.envUrl !== undefined) t.resources.iblEnvironmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = t.archetypes.Geometry.insert({ pbrModelUrl: args.modelUrl });
            t.archetypes.Model.insert({
                pbrGeometryRef: geoId,
                position: [0, 0, 0],
                rotation: Quat.identity,
                scale: [1, 1, 1],
                visible: true,
                parent: 0,
                animationSkeletonRef: 0,
            });
            t.resources.orbitFitGeometryRef = geoId;
            if (args.orbitFit) {
                t.resources.orbitFitRadiusFactor = args.orbitFit.radiusFactor;
                t.resources.orbitFitHeightFactor = args.orbitFit.heightFactor;
            }
            return geoId;
        },
    },
});

export type SkinnedFoxService = Database.Plugin.ToDatabase<typeof skinnedFoxPlugin>;
