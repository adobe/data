// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { pbrIbl, pbrModelLoader, pbrShapes } from "@adobe/data-gpu";

interface OrbitState {
    entityId: number;
    radius: number;
    speed: number;
}

export const solarSystemPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader, pbrShapes),
    resources: {
        orbits: { default: [] as OrbitState[], transient: true },
        cameraAngle: { default: 0 as F32, transient: true },
        cameraDragging: { default: false as boolean, transient: true },
    },
    transactions: {
        addOrbit(t, orbit: OrbitState) {
            t.resources.orbits = [...t.resources.orbits, orbit];
        },
        setOrbitPosition(t, updates: Array<{ entityId: number; position: Vec3 }>) {
            for (const { entityId, position } of updates) {
                t.update(entityId, { position });
            }
        },
        addCameraAngle(t, delta: number) {
            t.resources.cameraAngle = (t.resources.cameraAngle + delta) as F32;
            t.resources.cameraDragging = true;
        },
        releaseDrag(t) {
            t.resources.cameraDragging = false;
        },
    },
    systems: {
        orbitSystem: {
            create: db => {
                let lastTime = performance.now();
                const angles = new Map<number, number>();
                return () => {
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;

                    const orbits = db.store.resources.orbits;
                    const updates: Array<{ entityId: number; position: Vec3 }> = [];
                    for (const orbit of orbits) {
                        const prev = angles.get(orbit.entityId) ?? 0;
                        const angle = prev + orbit.speed * dt;
                        angles.set(orbit.entityId, angle);
                        updates.push({
                            entityId: orbit.entityId,
                            position: [
                                Math.cos(angle) * orbit.radius,
                                0,
                                Math.sin(angle) * orbit.radius,
                            ],
                        });
                    }
                    if (updates.length > 0) {
                        db.transactions.setOrbitPosition(updates);
                    }
                };
            },
            schedule: { during: ["update"] },
        },
        cameraSystem: {
            create: db => {
                let lastTime = performance.now();
                return () => {
                    const now = performance.now();
                    const dt = (now - lastTime) / 1000;
                    lastTime = now;

                    const { camera, cameraDragging } = db.store.resources;
                    if (!camera) return;

                    if (!cameraDragging) {
                        db.store.resources.cameraAngle = (db.store.resources.cameraAngle + dt * 0.12) as F32;
                    }

                    const angle = db.store.resources.cameraAngle;
                    const radius = 28;
                    const height = 10;
                    db.store.resources.camera = {
                        ...camera,
                        position: [Math.sin(angle) * radius, height, Math.cos(angle) * radius],
                        target: [0, 0, 0],
                    };
                };
            },
            schedule: { during: ["update"] },
        },
    },
});

export function createSolarSystemService() {
    return Database.create(solarSystemPlugin);
}

export type SolarSystemService = ReturnType<typeof createSolarSystemService>;
