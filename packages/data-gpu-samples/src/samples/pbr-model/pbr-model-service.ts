// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { pbrDirectRender, Model, Orbit } from "@adobe/data-gpu";

export const pbrModelPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrDirectRender, Orbit.plugin),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            const geoId = Model.plugin.transactions.insertGeometry(t, { modelUrl: args.modelUrl });
            Model.plugin.transactions.insertModel(t, { geometry: geoId });
            t.resources.orbit = {
                ...t.resources.orbit,
                fitGeometry:     geoId,
                fitRadiusFactor: args.orbitFit?.radiusFactor ?? t.resources.orbit.fitRadiusFactor,
                fitHeightFactor: args.orbitFit?.heightFactor ?? t.resources.orbit.fitHeightFactor,
            };
            return geoId;
        },
    },
});

export type PbrModelService = Database.Plugin.ToDatabase<typeof pbrModelPlugin>;
