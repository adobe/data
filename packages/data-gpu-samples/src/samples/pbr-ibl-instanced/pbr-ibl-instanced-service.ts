// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Quat, Vec3 } from "@adobe/data/math";
import type { Aabb } from "@adobe/data/math";
import { pbrIbl, pbrModelLoader } from "@adobe/data-gpu";

export const pbrIblInstancedPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader),
    resources: {
        orbitCenter: { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius: { default: 10 as F32, transient: true },
        orbitHeight: { default: 2 as F32, transient: true },
        orbitAngle: { default: 0 as F32, transient: true },
        orbitAutoSpin: { default: true as boolean, transient: true },
        autoFitInstancedRef: { default: 0 as number, transient: true },
        autoFitInstancedGridExtent: { default: 0 as F32, transient: true },
        autoFitInstancedSizeFactor: { default: 2 as F32, transient: true },
        autoFitInstancedHeightFactor: { default: 0.5 as F32, transient: true },
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
        initializeScene(t, args: {
            modelUrl: string;
            envUrl?: string;
            lightColor?: Vec3;
            grid: number;
            spacing: number;
        }): number {
            if (args.envUrl !== undefined) t.resources.iblEnvironmentUrl = args.envUrl;
            if (args.lightColor !== undefined) t.resources.lightColor = args.lightColor;
            const geoId = t.archetypes.Geometry.insert({ pbrModelUrl: args.modelUrl });
            const offset = (args.grid - 1) / 2;
            for (let x = 0; x < args.grid; x++) {
                for (let z = 0; z < args.grid; z++) {
                    t.archetypes.Model.insert({
                        pbrGeometryRef: geoId,
                        position: [(x - offset) * args.spacing, 0, (z - offset) * args.spacing],
                        rotation: Quat.identity,
                        scale: [1, 1, 1],
                        visible: true,
                        parent: 0,
                        animationSkeletonRef: 0,
                    });
                }
            }
            t.resources.autoFitInstancedRef = geoId;
            t.resources.autoFitInstancedGridExtent = offset * args.spacing;
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
                    };
                };
            },
            schedule: { during: ["update"] },
        },
        autoFitOrbit: {
            create: db => () => {
                const ref = db.store.resources.autoFitInstancedRef;
                if (!ref) return;
                const entity = db.store.read(ref) as { pbrModelBounds?: Aabb } | null;
                const bounds = entity?.pbrModelBounds;
                if (!bounds) return;
                db.store.resources.autoFitInstancedRef = 0;
                const size = Math.max(
                    bounds.max[0] - bounds.min[0],
                    bounds.max[1] - bounds.min[1],
                    bounds.max[2] - bounds.min[2],
                );
                const gridExtent = db.store.resources.autoFitInstancedGridExtent;
                db.transactions.setOrbit({
                    center: [0, 0, 0],
                    radius: gridExtent + size * db.store.resources.autoFitInstancedSizeFactor,
                    height: size * db.store.resources.autoFitInstancedHeightFactor,
                });
            },
            schedule: { during: ["preUpdate"] },
        },
    },
});

export type PbrIblInstancedService = Database.Plugin.ToDatabase<typeof pbrIblInstancedPlugin>;
