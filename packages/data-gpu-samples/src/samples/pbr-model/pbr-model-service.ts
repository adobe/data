// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Quat } from "@adobe/data/math";
import { orbitCamera, pbrDirect, pbrModelLoader } from "@adobe/data-gpu";

export const pbrModelPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrDirect, pbrModelLoader, orbitCamera),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
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

export type PbrModelService = Database.Plugin.ToDatabase<typeof pbrModelPlugin>;
