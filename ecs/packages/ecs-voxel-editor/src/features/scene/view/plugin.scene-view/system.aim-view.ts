// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Mat4x4, System, Vec3 } from "@adobe/ecs";
import { Frame, Target, View } from "@adobe/ecs-gpu";
import { basisOf, camera, fieldOfView, followEditing } from "../../../camera/model/index.js";
import { mainModel, model, scale, size } from "../../../voxels/model/index.js";
import { sceneCamera } from "./component.scene-camera.js";
import { scene } from "./resource.scene.js";

/**
 * Aims the scene's view through the camera, its projection fitting the view's shape and reaching past the main model,
 * and gives the sky the inverse of that projection and the eye, each only as it changes.
 */
export const aimView: System = System.create({
    components: { with: [sceneCamera, View.target, View.viewport, View.projection] },
    lookup: { targets: { with: [Target.size] }, models: { with: [model, size, scale] } },
    after: [followEditing],
    before: [Frame.update],
}, (row, { resources, lookup }) => {
    const main = lookup.models(resources[mainModel]);
    if (main === null) return;
    const [width, height] = lookup.targets(row[View.target])?.[Target.size] ?? [1, 1];
    const [, , across, down] = row[View.viewport];
    const aspect = (across * width) / Math.max(1, down * height);
    const view = basisOf(resources[camera]);
    const reach = Vec3.length(Vec3.multiply(main[size], main[scale])) + resources[camera].distance;
    const projection = Mat4x4.multiply(
        Mat4x4.perspective(fieldOfView, aspect, Math.max(reach / 2000, 0.01), reach * 2),
        Mat4x4.lookAt(view.eye, Vec3.add(view.eye, view.forward), view.up),
    );
    if (same(projection, row[View.projection])) return;
    row[View.projection] = projection;
    resources[scene] = { inverseViewProjection: Mat4x4.inverse(projection), eye: view.eye };
});

/** Whether two lists of numbers are equal. */
const same = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};
