// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Quat, Vec3 } from "@adobe/data/math";
import type { Aabb } from "@adobe/data/math";
import { pbrIbl, pbrModelLoader, pbrSkinning } from "@adobe/data-gpu";

export const skinnedFoxPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader, pbrSkinning),
    resources: {
        orbitCenter: { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius: { default: 3 as F32, transient: true },
        orbitHeight: { default: 1 as F32, transient: true },
        orbitAngle: { default: 0 as F32, transient: true },
        orbitAutoSpin: { default: true as boolean, transient: true },
        autoFitOrbitRef: { default: 0 as number, transient: true },
        autoFitOrbitRadiusFactor: { default: 1.6 as F32, transient: true },
        autoFitOrbitHeightFactor: { default: 0.4 as F32, transient: true },
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
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            if (args.envUrl !== undefined) t.resources.iblEnvironmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = t.archetypes.Geometry.insert({ pbrModelUrl: args.modelUrl });
            t.archetypes.Model.insert({
                pbrGeometryRef: geoId,
                position: [0, 0, 0],
                rotation: Quat.identity,
                scale: [1, 1, 1],
                visible: true,
                parent: 0,
                animationSkeletonRef: 0,
            });
            t.resources.autoFitOrbitRef = geoId;
            if (args.orbitFit) {
                t.resources.autoFitOrbitRadiusFactor = args.orbitFit.radiusFactor;
                t.resources.autoFitOrbitHeightFactor = args.orbitFit.heightFactor;
            }
            return geoId;
        },
    },
    systems: {
        orbitCamera: {
            create: db => {
                let lastTime = performance.now();
                return () => {
                    const { orbitCenter, orbitRadius, orbitHeight, orbitAutoSpin, camera } = db.store.resources;
                    if (!camera) return;
                    const now = performance.now();
                    if (orbitAutoSpin) {
                        const dt = (now - lastTime) / 1000;
                        db.store.resources.orbitAngle = db.store.resources.orbitAngle + dt * 0.5;
                    }
                    lastTime = now;
                    const angle = db.store.resources.orbitAngle;
                    db.store.resources.camera = {
                        ...camera,
                        position: [
                            orbitCenter[0] + Math.sin(angle) * orbitRadius,
                            orbitCenter[1] + orbitHeight,
                            orbitCenter[2] + Math.cos(angle) * orbitRadius,
                        ],
                        target: orbitCenter,
                        // Fox is authored in cm — extend the depth range so the
                        // ~150-unit-tall mesh isn't clipped by the default 0.1/100 planes.
                        nearPlane: Math.max(orbitRadius * 0.01, 0.1) as F32,
                        farPlane: Math.max(orbitRadius * 4, 100) as F32,
                    };
                };
            },
            schedule: { during: ["update"] },
        },
        autoFitOrbit: {
            create: db => () => {
                const ref = db.store.resources.autoFitOrbitRef;
                if (!ref) return;
                const entity = db.store.read(ref) as { pbrModelBounds?: Aabb } | null;
                const bounds = entity?.pbrModelBounds;
                if (!bounds) return;
                db.store.resources.autoFitOrbitRef = 0;
                const size = Math.max(
                    bounds.max[0] - bounds.min[0],
                    bounds.max[1] - bounds.min[1],
                    bounds.max[2] - bounds.min[2],
                );
                db.transactions.setOrbit({
                    center: [
                        (bounds.min[0] + bounds.max[0]) / 2,
                        (bounds.min[1] + bounds.max[1]) / 2,
                        (bounds.min[2] + bounds.max[2]) / 2,
                    ],
                    radius: size * db.store.resources.autoFitOrbitRadiusFactor,
                    height: size * db.store.resources.autoFitOrbitHeightFactor,
                });
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});

export type SkinnedFoxService = Database.Plugin.ToDatabase<typeof skinnedFoxPlugin>;
