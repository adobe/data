// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { pbrIbl, pbrModelLoader } from "@adobe/data-gpu";

export const pbrModelIblPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader),
    resources: {
        orbitCenter: { default: [0, 0, 0] as Vec3, transient: true },
        orbitRadius: { default: 3 as F32, transient: true },
        orbitHeight: { default: 0 as F32, transient: true },
        orbitAngle: { default: 0 as F32, transient: true },
        orbitAutoSpin: { default: true as boolean, transient: true },
    },
    transactions: {
        setOrbit(t, args: { center: Vec3; radius: number; height: number }) {
            t.resources.orbitCenter = args.center;
            t.resources.orbitRadius = args.radius;
            t.resources.orbitHeight = args.height;
        },
        addOrbitAngle(t, delta: number) {
            t.resources.orbitAngle = (t.resources.orbitAngle + delta) as F32;
            t.resources.orbitAutoSpin = false;
        },
        resumeAutoSpin(t) {
            t.resources.orbitAutoSpin = true;
        },
    },
    systems: {
        orbitCamera: {
            create: db => {
                const start = performance.now();
                let lastTime = start;
                return () => {
                    const { orbitCenter, orbitRadius, orbitHeight, orbitAutoSpin, camera } = db.store.resources;
                    if (!camera) return;
                    const now = performance.now();
                    if (orbitAutoSpin) {
                        const dt = (now - lastTime) / 1000;
                        db.store.resources.orbitAngle = (db.store.resources.orbitAngle + dt * 1.0) as F32;
                    }
                    lastTime = now;
                    const angle = db.store.resources.orbitAngle;
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

export function createPbrModelIblService() {
    return Database.create(pbrModelIblPlugin);
}

export type PbrModelIblService = ReturnType<typeof createPbrModelIblService>;
