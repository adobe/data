// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { pbrDirect } from "@adobe/data-graphics";

export const pbrModelPlugin = Database.Plugin.create({
    extends: pbrDirect,
    resources: {
        orbitCenter: { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius: { default: 3 as F32, transient: true },
        orbitHeight: { default: 0 as F32, transient: true },
    },
    transactions: {
        setOrbit(t, args: { center: Vec3; radius: number; height: number }) {
            t.resources.orbitCenter = args.center;
            t.resources.orbitRadius = args.radius;
            t.resources.orbitHeight = args.height;
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
            schedule: { during: ["update"] }
        }
    }
});

export function createPbrModelService() {
    return Database.create(pbrModelPlugin);
}

export type PbrModelService = ReturnType<typeof createPbrModelService>;
