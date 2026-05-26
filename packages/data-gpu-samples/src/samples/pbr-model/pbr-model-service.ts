// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { pbrDirectRender, model, orbit } from "@adobe/data-gpu";

export const pbrModelPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrDirectRender, orbit),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
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

export type PbrModelService = Database.Plugin.ToDatabase<typeof pbrModelPlugin>;
