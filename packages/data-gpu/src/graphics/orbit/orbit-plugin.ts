// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Aabb, F32, Vec3 } from "@adobe/data/math";
import { camera } from "../camera/camera-plugin.js";

/**
 * Authoring abstraction: drag-and-spin orbit camera. The user authors the
 * orbit parameters; an internal system writes them into the `camera` resource
 * each frame. Near/far planes are derived from the radius so models authored
 * in any unit (m, cm, ft) render without clipping.
 *
 * Auto-fit: setting `orbitFitGeometry` to a Geometry entity id makes the fit
 * system size the orbit to that geometry's `_bounds` on the first frame after
 * the bounds become available. Useful for "load-then-frame" UX.
 *
 * Drag: `addOrbitAngle(delta)` rotates and pauses auto-spin; `resumeAutoSpin()`
 * un-pauses (typically called on drag end).
 */
export const orbit = Database.Plugin.create({
    extends: camera,
    resources: {
        orbitCenter:           { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius:           { default: 3 as F32, transient: true },
        orbitHeight:           { default: 0 as F32, transient: true },
        orbitAngle:            { default: 0 as F32, transient: true },
        orbitAutoSpin:         { default: true as boolean, transient: true },
        orbitAutoSpinSpeed:    { default: 0.5 as F32, transient: true },
        /** Near plane = max(orbitRadius × this, 0.1). */
        orbitNearFactor:       { default: 0.01 as F32, transient: true },
        /** Far plane = max(orbitRadius × this, 100). */
        orbitFarFactor:        { default: 4 as F32, transient: true },
        /** Entity id of a Geometry whose `_bounds` the fit system reads once
         *  to size the orbit. 0 disables; the system zeros it after applying. */
        orbitFitGeometry:      { default: 0 as number, transient: true },
        orbitFitRadiusFactor:  { default: 1.5 as F32, transient: true },
        orbitFitHeightFactor:  { default: 0.25 as F32, transient: true },
        /** Added to the fit radius after factor scaling. Used by grid /
         *  instanced setups that need to also clear a non-mesh extent. */
        orbitFitRadiusOffset:  { default: 0 as F32, transient: true },
        /** Override the fit center; when null, fit uses the bounds centroid. */
        orbitFitCenter:        { default: null as Vec3 | null, transient: true },
    },
    transactions: {
        setOrbit(t, args: { center: Vec3; radius: number; height: number }) {
            t.resources.orbitCenter = args.center;
            t.resources.orbitRadius = args.radius;
            t.resources.orbitHeight = args.height;
        },
        addOrbitAngle(t, delta: number) {
            t.resources.orbitAngle = t.resources.orbitAngle + delta;
            t.resources.orbitAutoSpin = false;
        },
        resumeAutoSpin(t) {
            t.resources.orbitAutoSpin = true;
        },
    },
    systems: {
        _orbitCameraSystem: {
            create: db => {
                let lastTime = performance.now();
                return () => {
                    const {
                        orbitCenter, orbitRadius, orbitHeight,
                        orbitAutoSpin, orbitAutoSpinSpeed,
                        orbitNearFactor, orbitFarFactor,
                        camera: cam,
                    } = db.store.resources;
                    if (!cam) return;
                    const now = performance.now();
                    if (orbitAutoSpin) {
                        const dt = (now - lastTime) / 1000;
                        db.store.resources.orbitAngle = db.store.resources.orbitAngle + dt * orbitAutoSpinSpeed;
                    }
                    lastTime = now;
                    const angle = db.store.resources.orbitAngle;
                    db.store.resources.camera = {
                        ...cam,
                        position: [
                            orbitCenter[0] + Math.sin(angle) * orbitRadius,
                            orbitCenter[1] + orbitHeight,
                            orbitCenter[2] + Math.cos(angle) * orbitRadius,
                        ],
                        target: orbitCenter,
                        nearPlane: Math.max(orbitRadius * orbitNearFactor, 0.1),
                        farPlane:  Math.max(orbitRadius * orbitFarFactor,  100),
                    };
                };
            },
            schedule: { during: ["update"] },
        },
        _orbitAutoFitSystem: {
            create: db => () => {
                const ref = db.store.resources.orbitFitGeometry;
                if (!ref) return;
                // Case 1: orbitFitGeometry only ever holds a Geometry entity id, and
                // the model loader writes `_bounds` to every Geometry. `_bounds` lives
                // on _modelLoader's schema, which `orbit` doesn't extend.
                const entity = db.store.read(ref) as { _bounds?: Aabb } | null;
                const bounds = entity?._bounds;
                if (!bounds) return;
                db.store.resources.orbitFitGeometry = 0;
                const size = Math.max(
                    bounds.max[0] - bounds.min[0],
                    bounds.max[1] - bounds.min[1],
                    bounds.max[2] - bounds.min[2],
                );
                const center = db.store.resources.orbitFitCenter ?? [
                    (bounds.min[0] + bounds.max[0]) / 2,
                    (bounds.min[1] + bounds.max[1]) / 2,
                    (bounds.min[2] + bounds.max[2]) / 2,
                ] as Vec3;
                db.transactions.setOrbit({
                    center,
                    radius: size * db.store.resources.orbitFitRadiusFactor + db.store.resources.orbitFitRadiusOffset,
                    height: size * db.store.resources.orbitFitHeightFactor,
                });
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});
