// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { createStructBuffer, copyToGPUBuffer, getStructLayout, type TypedBuffer } from "@adobe/data/typed-buffer";
import { camera } from "../camera/camera-plugin.js";
import { light } from "../light/light-plugin.js";
import { Camera } from "../camera/camera.js";
import { SceneUniforms } from "./scene-uniforms.js";

const sceneUniformsStructLayout = getStructLayout(SceneUniforms.schema);

/**
 * sceneUniforms
 *   query: —
 *   read:
 *     camera
 *     lightDirection
 *     lightColor
 *     ambientStrength
 *   write:
 *     _sceneUniformsBuffer: GPUBuffer
 */
export const sceneUniforms = Database.Plugin.create({
    extends: Database.Plugin.combine(camera, light),
    resources: {
        _sceneUniformsBuffer: { default: null as GPUBuffer | null, transient: true },
    },
    systems: {
        sceneUniformsSystem: {
            create: db => {
                let structBuffer: TypedBuffer<SceneUniforms> | null = null;
                return () => {
                    const { device, lightDirection, ambientStrength, lightColor } = db.store.resources;
                    const cam = db.store.resources.camera;
                    if (!device || !cam) return;

                    structBuffer ??= createStructBuffer(SceneUniforms.schema, sceneUniformsStructLayout.size);

                    let gpuBuffer = db.store.resources._sceneUniformsBuffer;
                    if (!gpuBuffer) {
                        gpuBuffer = device.createBuffer({
                            size: sceneUniformsStructLayout.size,
                            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                        });
                        db.store.resources._sceneUniformsBuffer = gpuBuffer;
                    }

                    structBuffer.set(0, {
                        viewProjectionMatrix: Camera.toViewProjection(cam),
                        lightDirection,
                        ambientStrength,
                        lightColor,
                        cameraPosition: cam.position,
                    });

                    db.store.resources._sceneUniformsBuffer = copyToGPUBuffer(structBuffer, device, gpuBuffer);
                };
            },
            schedule: { during: ["preRender"] },
        },
    },
});
