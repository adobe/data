// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb, Vec3 } from "@adobe/data/math";
import { Camera } from "../camera/camera.js";
import type { Orbit } from "./orbit.js";

/**
 * Authoring abstraction: drag-and-spin orbit camera. The user authors the
 * orbit state; an internal system writes the resolved view into the `camera`
 * resource each frame. Near/far planes are derived from the radius so models
 * authored in any unit (m, cm, ft) render without clipping.
 *
 * Auto-fit: setting `orbit.fitGeometry` to a Geometry entity id makes the fit
 * system size the orbit to that geometry's `_bounds` on the first frame after
 * the bounds become available. Useful for "load-then-frame" UX.
 *
 * Drag: `addOrbitAngle(delta)` rotates and pauses auto-spin; `resumeAutoSpin()`
 * un-pauses (typically called on drag end).
 */
export const plugin = Database.Plugin.create({
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
                fitGeometry:     0,
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
    systems: {
        _orbitCameraSystem: {
            create: db => {
                let lastTime = performance.now();
                return () => {
                    const { orbit, camera: cam } = db.store.resources;
                    if (!cam) return;
                    const now = performance.now();
                    if (orbit.autoSpin) {
                        const dt = (now - lastTime) / 1000;
                        db.store.resources.orbit = { ...orbit, angle: orbit.angle + dt * orbit.autoSpinSpeed };
                    }
                    lastTime = now;
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
                if (!orbit.fitGeometry) return;
                // Case 1: orbit.fitGeometry only ever holds a Geometry entity id, and
                // the model loader writes `_bounds` to every Geometry. `_bounds` lives
                // on _modelLoader's schema, which `orbit` doesn't extend.
                const entity = db.store.read(orbit.fitGeometry) as { _bounds?: Aabb } | null;
                const bounds = entity?._bounds;
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
                    fitGeometry: 0,
                };
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
