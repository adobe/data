// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Quat, Vec3 } from "@adobe/data/math";
import type { Aabb } from "@adobe/data/math";
import { pbrDirect, pbrModelLoader } from "@adobe/data-gpu";

export const pbrModelPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrDirect, pbrModelLoader),
    resources: {
        orbitCenter: { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius: { default: 3 as F32, transient: true },
        orbitHeight: { default: 0 as F32, transient: true },
        autoFitOrbitRef: { default: 0 as number, transient: true },
        autoFitOrbitRadiusFactor: { default: 1.5 as F32, transient: true },
        autoFitOrbitHeightFactor: { default: 0.25 as F32, transient: true },
    },
    transactions: {
        setOrbit(t, args: { center: Vec3; radius: number; height: number }) {
            t.resources.orbitCenter = args.center;
            t.resources.orbitRadius = args.radius;
            t.resources.orbitHeight = args.height;
        },
        initializeScene(t, args: {
            modelUrl: string;
            orbitFit?: { radiusFactor: number; heightFactor: number };
        }): number {
            const geoId = t.archetypes.Geometry.insert({ pbrModelUrl: args.modelUrl });
            t.archetypes.Model.insert({
                pbrGeometryRef: geoId,
                position: [0, 0, 0],
                rotation: Quat.identity,
                scale: [1, 1, 1],
                visible: true,
                parent: 0,
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
                const start = performance.now();
                return () => {
                    const { orbitCenter, orbitRadius, orbitHeight, camera } = db.store.resources;
                    if (!camera) return;
                    const t = (performance.now() - start) / 1000;
                    const angle = t * 0.5;
                    const x = orbitCenter[0] + Math.sin(angle) * orbitRadius;
                    const z = orbitCenter[2] + Math.cos(angle) * orbitRadius;
                    const y = orbitCenter[1] + orbitHeight;
                    db.store.resources.camera = {
                        ...camera,
                        position: [x, y, z],
                        target: orbitCenter,
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

export type PbrModelService = Database.Plugin.ToDatabase<typeof pbrModelPlugin>;
