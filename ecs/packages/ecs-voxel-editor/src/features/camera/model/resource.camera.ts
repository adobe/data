// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Camera } from "./type.camera.js";

/** The camera the scene is seen through: at first turned 0.6 radians about `y` and raised 0.5 above the horizon. */
export const camera = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [camera]: { type: Camera; default: { target: [0, 0, 0]; rotation: [-0.23635, 0.28633, 0.07311, 0.92564]; distance: 40 } };
    }
}
