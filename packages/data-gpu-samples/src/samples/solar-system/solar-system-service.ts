// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Quat, Vec3 } from "@adobe/data/math";
import {
    animation,
    pbrIbl,
    pbrModelLoader,
    pbrShapes,
    type AnimationTrack,
} from "@adobe/data-gpu";

const TWO_PI = Math.PI * 2;
const ORBIT_SEGMENTS = 64;

function buildOrbitTrack(radius: number): AnimationTrack {
    const times = new Float32Array(ORBIT_SEGMENTS + 1);
    const values = new Float32Array((ORBIT_SEGMENTS + 1) * 3);
    for (let i = 0; i <= ORBIT_SEGMENTS; i++) {
        const t = (i / ORBIT_SEGMENTS) * TWO_PI;
        times[i] = t;
        values[i * 3] = Math.cos(t) * radius;
        values[i * 3 + 2] = Math.sin(t) * radius;
    }
    return { targetIndex: 0, component: "position", times, values, interpolation: "linear" };
}

interface PlanetSpec {
    color: [number, number, number, number];
    metallic: number;
    roughness: number;
    emissive?: Vec3;
    position: Vec3;
    scale: Vec3;
    parent?: number;
    orbitRadius?: number;
    orbitSpeed?: number;
}

export const solarSystemPlugin = Database.Plugin.create({
    extends: Database.Plugin.combine(pbrIbl, pbrModelLoader, pbrShapes, animation),
    resources: {
        cameraAngle: { default: 0 as F32, transient: true },
        cameraDragging: { default: false as boolean, transient: true },
    },
    transactions: {
        addCameraAngle(t, delta: number) {
            t.resources.cameraAngle = t.resources.cameraAngle + delta;
            t.resources.cameraDragging = true;
        },
        releaseDrag(t) {
            t.resources.cameraDragging = false;
        },
        initializeScene(t) {
            const insertPlanet = (spec: PlanetSpec): number => {
                const geo = t.archetypes.Sphere.insert({
                    pbrSphereSpec: {
                        color: spec.color,
                        emissive: spec.emissive,
                        metallic: spec.metallic,
                        roughness: spec.roughness,
                        rings: 32,
                        segments: 64,
                    },
                });
                const model = t.archetypes.Model.insert({
                    pbrGeometryRef: geo,
                    position: spec.position,
                    rotation: Quat.identity,
                    scale: spec.scale,
                    visible: true,
                    parent: spec.parent ?? 0,
                    animationSkeletonRef: 0,
                });
                if (spec.orbitRadius !== undefined && spec.orbitSpeed !== undefined) {
                    const clip = t.archetypes.AnimationClip.insert({
                        animationClipTracks: [buildOrbitTrack(spec.orbitRadius)],
                        animationClipDuration: TWO_PI,
                    });
                    t.archetypes.AnimationPlayer.insert({
                        animationClipRef: clip,
                        animationTargets: [model],
                        animationTime: 0,
                        animationSpeed: spec.orbitSpeed,
                        animationLoop: true,
                        animationPlaying: true,
                    });
                }
                return model;
            };

            const sun = insertPlanet({
                color: [1.0, 0.92, 0.6, 1.0], emissive: [3.0, 2.5, 0.8],
                metallic: 0, roughness: 1.0,
                position: [0, 0, 0], scale: [2.5, 2.5, 2.5],
            });
            insertPlanet({
                color: [0.55, 0.5, 0.45, 1.0], metallic: 0.1, roughness: 0.9,
                position: [4.5, 0, 0], scale: [0.25, 0.25, 0.25], parent: sun,
                orbitRadius: 4.5, orbitSpeed: 4.0,
            });
            insertPlanet({
                color: [0.9, 0.75, 0.4, 1.0], metallic: 0.0, roughness: 0.95,
                position: [7, 0, 0], scale: [0.5, 0.5, 0.5], parent: sun,
                orbitRadius: 7.0, orbitSpeed: 1.6,
            });
            const earth = insertPlanet({
                color: [0.15, 0.45, 0.85, 1.0], metallic: 0.05, roughness: 0.85,
                position: [10, 0, 0], scale: [0.55, 0.55, 0.55], parent: sun,
                orbitRadius: 10.0, orbitSpeed: 1.0,
            });
            insertPlanet({
                color: [0.65, 0.65, 0.65, 1.0], metallic: 0.0, roughness: 0.95,
                position: [1.2, 0, 0], scale: [0.15, 0.15, 0.15], parent: earth,
                orbitRadius: 1.2, orbitSpeed: 13.4,
            });
            insertPlanet({
                color: [0.82, 0.32, 0.18, 1.0], metallic: 0.1, roughness: 0.9,
                position: [14, 0, 0], scale: [0.4, 0.4, 0.4], parent: sun,
                orbitRadius: 14.0, orbitSpeed: 0.53,
            });
        },
    },
    systems: {
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
                        db.store.resources.cameraAngle = db.store.resources.cameraAngle + dt * 0.12;
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

export type SolarSystemService = Database.Plugin.ToDatabase<typeof solarSystemPlugin>;
