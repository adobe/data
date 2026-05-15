// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { F32, Vec3 } from "@adobe/data/math";
import { createStructBuffer, copyToGPUBuffer, getStructLayout, type TypedBuffer } from "@adobe/data/typed-buffer";
import { camera } from "./camera.js";
import { Camera } from "../types/camera/camera.js";
import { SceneUniforms } from "../types/scene-uniforms/scene-uniforms.js";

const sceneUniformsStructLayout = getStructLayout(SceneUniforms.schema);

export const defaultSceneUniforms = Database.Plugin.create({
    extends: camera,
    resources: {
        sceneUniformsBuffer: { default: null as GPUBuffer | null, transient: true },
        lightDirection: { default: Vec3.normalize([-1, -3, -10]) as Vec3 },
        ambientStrength: { default: 0.5 as F32 },
        lightColor: { default: [1.0, 1.0, 1.0] as Vec3 },
    },
    transactions: {
        setLight(t, args: { direction?: Vec3; color?: Vec3 }) {
            if (args.direction !== undefined) t.resources.lightDirection = Vec3.normalize(args.direction);
            if (args.color !== undefined) t.resources.lightColor = args.color;
        },
    },
    systems: {
        updateSceneUniforms: {
            create: db => {
                let structBuffer: TypedBuffer<SceneUniforms> | null = null;
                return () => {
                    const { device, lightDirection, ambientStrength, lightColor } = db.store.resources;
                    const cam = db.store.resources.camera;
                    if (!device || !cam) return;

                    structBuffer ??= createStructBuffer(SceneUniforms.schema, sceneUniformsStructLayout.size);

                    let gpuBuffer = db.store.resources.sceneUniformsBuffer;
                    if (!gpuBuffer) {
                        gpuBuffer = device.createBuffer({
                            size: sceneUniformsStructLayout.size,
                            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        });
                        db.store.resources.sceneUniformsBuffer = gpuBuffer;
                    }

                    structBuffer.set(0, {
                        viewProjectionMatrix: Camera.toViewProjection(cam),
                        lightDirection,
                        ambientStrength,
                        lightColor,
                        cameraPosition: cam.position,
                    });

                    db.store.resources.sceneUniformsBuffer = copyToGPUBuffer(structBuffer, device, gpuBuffer);
                };
            },
            schedule: { during: ["preRender"] }
        },
    },
});
