// © 2026 Adobe. MIT License. See /LICENSE for details.
import { clock, Mat4x4, System, type Vec3 } from '@adobe/ecs';
import { Frame, Target, View } from '@adobe/ecs-gpu';
import { camera } from '../shared/camera.js';

/** Aims each view's camera, its projection fitting the view's shape on its surface. */
export const aim = System.create({
    components: { with: [camera, View.target, View.viewport, View.projection] },
    lookup: { targets: { with: [Target.size] } },
    before: [Frame.update],
}, (row, { resources, lookup }) => {
    const [width, height] = lookup.targets(row[View.target])?.[Target.size] ?? [1, 1];
    const [, , across, down] = row[View.viewport];
    const aspect = (across * width) / Math.max(1, down * height);
    const seconds = resources[clock].now / 1000;
    const eye: Vec3 = row[camera] === "above" ? [0, 8, 0.001] : row[camera] === "side" ? [6, 0.5, 0] : [Math.cos(seconds * 0.3) * 6, 2.5, Math.sin(seconds * 0.3) * 6];
    row[View.projection] = Mat4x4.multiply(Mat4x4.perspective(Math.PI / 4, aspect, 0.1, 50), Mat4x4.lookAt(eye, [0, 0, 0], [0, 1, 0]));
});
