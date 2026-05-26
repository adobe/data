// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import { pbrIblRender, model, orbit } from "@adobe/data-gpu";

export const pbrModelIblPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, orbit),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            if (args.envUrl !== undefined) t.resources.environmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = model.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            model.transactions.insertModel(t, { geometry: geoId });
            t.resources.orbitFitGeometry = geoId;
            if (args.orbitFit) {
                t.resources.orbitFitRadiusFactor = args.orbitFit.radiusFactor;
                t.resources.orbitFitHeightFactor = args.orbitFit.heightFactor;
            }
            return geoId;
        },
    },
});

export type PbrModelIblService = Database.Plugin.ToDatabase<typeof pbrModelIblPlugin>;
