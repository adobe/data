// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import { pbrIblRender, model, orbit } from "@adobe/data-gpu";

export const pbrIblInstancedPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, orbit),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            grid: number;
            spacing: number;
        }): number {
            if (args.envUrl !== undefined) t.resources.environmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = model.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            const offset = (args.grid - 1) / 2;
            for (let x = 0; x < args.grid; x++) {
                for (let z = 0; z < args.grid; z++) {
                    model.transactions.insertModel(t, {
                        geometry: geoId,
                        position: [(x - offset) * args.spacing, 0, (z - offset) * args.spacing],
                    });
                }
            }
            t.resources.orbitFitGeometry = geoId;
            t.resources.orbitFitRadiusOffset = offset * args.spacing;
            t.resources.orbitFitRadiusFactor = 2;
            t.resources.orbitFitHeightFactor = 0.5;
            t.resources.orbitFitCenter = [0, 0, 0];
            return geoId;
        },
    },
});

export type PbrIblInstancedService = Database.Plugin.ToDatabase<typeof pbrIblInstancedPlugin>;
