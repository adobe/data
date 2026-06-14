// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb, Vec3 } from "@adobe/data/math";
import { orbitData } from "./orbit-data-plugin.js";

/**
 * Systems that drive `camera` from the `orbit` resource each frame.
 *
 * - **_orbitCameraSystem**: updates camera position/target/near/far from the
 *   orbit polar coords; auto-spins when `orbit.autoSpin` is true.
 * - **_orbitAutoFitSystem**: when `orbit.fitMesh` is non-zero, reads that
 *   mesh's `localBounds`, sizes the orbit to fit, and zeroes the field.
 */
export const orbitSystem = Database.Plugin.create({
    extends: orbitData,
    systems: {
        _orbitCameraSystem: {
            create: db => {
                return () => {
                    const { orbit, camera: cam } = db.store.resources;
                    if (!cam) return;
                    if (orbit.autoSpin) {
                        const dt = db.store.resources.frameTime.dt;
                        db.store.resources.orbit = { ...orbit, angle: orbit.angle + dt * orbit.autoSpinSpeed };
                    }
                    const angle = db.store.resources.orbit.angle;
                    db.store.resources.camera = {
                        ...cam,
                        position: [
                            orbit.center[0] + Math.sin(angle) * orbit.radius,
                            orbit.center[1] + orbit.height,
                            orbit.center[2] + Math.cos(angle) * orbit.radius,
                        ],
                        target: orbit.center,
                        nearPlane: Math.max(orbit.radius * orbit.nearFactor, 0.1),
                        farPlane:  Math.max(orbit.radius * orbit.farFactor,  100),
                    };
                };
            },
            schedule: { during: ["update"] },
        },
        _orbitAutoFitSystem: {
            create: db => () => {
                const orbit = db.store.resources.orbit;
                if (!orbit.fitMesh) return;
                const entity = db.store.read(orbit.fitMesh) as { localBounds?: Aabb } | null;
                const bounds = entity?.localBounds;
                if (!bounds) return;
                const size = Math.max(
                    bounds.max[0] - bounds.min[0],
                    bounds.max[1] - bounds.min[1],
                    bounds.max[2] - bounds.min[2],
                );
                const center = orbit.fitCenter ?? [
                    (bounds.min[0] + bounds.max[0]) / 2,
                    (bounds.min[1] + bounds.max[1]) / 2,
                    (bounds.min[2] + bounds.max[2]) / 2,
                ] as Vec3;
                db.store.resources.orbit = {
                    ...orbit,
                    center,
                    radius: size * orbit.fitRadiusFactor + orbit.fitRadiusOffset,
                    height: size * orbit.fitHeightFactor,
                    fitMesh: 0,
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
