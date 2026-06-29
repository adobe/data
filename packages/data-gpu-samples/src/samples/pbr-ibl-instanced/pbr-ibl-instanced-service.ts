// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import { Model, Orbit, pbrIblRender } from "@adobe/data-gpu/graphics";

export const pbrIblInstancedPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIblRender, Orbit.plugin),
    transactions: {
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            grid: number;
            spacing: number;
        }): number {
            t.resources.light = {
                ...t.resources.light,
                environmentUrl: args.envUrl ?? t.resources.light.environmentUrl,
                color:          args.lightColor ?? t.resources.light.color,
            };
            const meshId = Model.plugin.transactions.insertGltfMesh(t, { url: args.modelUrl });
            const offset = (args.grid - 1) / 2;
            for (let x = 0; x < args.grid; x++) {
                for (let z = 0; z < args.grid; z++) {
                    Model.plugin.transactions.insertModel(t, {
                        mesh: meshId,
                        position: [(x - offset) * args.spacing, 0, (z - offset) * args.spacing],
                    });
                }
            }
            t.resources.orbit = {
                ...t.resources.orbit,
                fitMesh:         meshId,
                fitRadiusOffset: offset * args.spacing,
                fitRadiusFactor: 2,
                fitHeightFactor: 0.5,
                fitCenter:       [0, 0, 0],
            };
            return meshId;
        },
    },
});

export type PbrIblInstancedService = Database.Plugin.ToDatabase<typeof pbrIblInstancedPlugin>;
