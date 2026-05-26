// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { graphics } from "../graphics-plugin.js";
import { Camera } from "./camera.js";

export const camera = Database.Plugin.create({
    extends: graphics,
    resources: {
        camera: {
            default: {
                aspect: 16 / 9,
                fieldOfView: Math.PI / 4,
                nearPlane: 0.1,
                farPlane: 100.0,
                position: [0, 0, 10],
                target: [0, 0, 0],
                up: [0, 1, 0],
                orthographic: 0,
            } satisfies Camera as Camera,
        },
    },
    systems: {
        updateCameraAspect: {
            create: db => () => {
                const { canvas } = db.store.resources;
                let { camera: cam } = db.store.resources;
                if (!canvas || !cam) return;
                const aspect = canvas.width / canvas.height;
                if (cam.aspect !== aspect) {
                    db.store.resources.camera = { ...cam, aspect };
                }
            },
            schedule: { during: ["preRender"] }
        },
    },
});
