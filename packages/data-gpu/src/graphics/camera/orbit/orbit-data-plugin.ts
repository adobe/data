// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Camera } from "../camera.js";
import type { Orbit } from "./orbit.js";

/**
 * Declarative orbit camera state — the authored surface.
 * Systems in `orbit-system-plugin.ts` drive the `camera` resource from this.
 */
export const orbitData = Database.Plugin.create({
    extends: Camera.plugin,
    resources: {
        orbit: {
            default: {
                center:          [0, 0, 0],
                radius:          3,
                height:          0,
                angle:           0,
                autoSpin:        true,
                autoSpinSpeed:   0.5,
                nearFactor:      0.01,
                farFactor:       4,
                fitMesh:         0,
                fitRadiusFactor: 1.5,
                fitHeightFactor: 0.25,
                fitRadiusOffset: 0,
                fitCenter:       null,
            } satisfies Orbit as Orbit,
        },
    },
    transactions: {
        setOrbit(t, args: Partial<Orbit>) {
            t.resources.orbit = { ...t.resources.orbit, ...args };
        },
        addOrbitAngle(t, delta: number) {
            const cur = t.resources.orbit;
            t.resources.orbit = { ...cur, angle: cur.angle + delta, autoSpin: false };
        },
        resumeAutoSpin(t) {
            t.resources.orbit = { ...t.resources.orbit, autoSpin: true };
        },
    },
});
