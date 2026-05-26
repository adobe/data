// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec3 } from "@adobe/data/math";
import type { Light } from "./light.js";

/**
 * Authored lighting state — a directional light plus optional image-based
 * lighting from an HDR environment.
 *
 * The `sceneUniforms` system packs these into the GPU uniform buffer the
 * renderers consume; the `iblInitSystem` fetches and bakes the IBL textures
 * from `light.environmentUrl`.
 */
export const plugin = Database.Plugin.create({
    resources: {
        light: {
            default: {
                direction:       Vec3.normalize([-1, -3, -10]),
                color:           [1.0, 1.0, 1.0],
                ambientStrength: 0.5,
                environmentUrl:  null,
            } satisfies Light as Light,
        },
    },
    transactions: {
        setLight(t, args: Partial<Light>) {
            const cur = t.resources.light;
            t.resources.light = {
                direction:       args.direction !== undefined ? Vec3.normalize(args.direction) : cur.direction,
                color:           args.color           ?? cur.color,
                ambientStrength: args.ambientStrength ?? cur.ambientStrength,
                environmentUrl:  args.environmentUrl  !== undefined ? args.environmentUrl : cur.environmentUrl,
            };
        },
    },
});
