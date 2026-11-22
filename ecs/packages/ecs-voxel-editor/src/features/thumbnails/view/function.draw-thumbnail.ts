// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ModelLook } from "./internal/type.model-look.js";

/**
 * Draws a model on a 2D canvas, filling it, as an isometric view turned `angle` radians about its up axis: each cube's
 * three visible sides shaded, drawn back to front.
 */
export const drawThumbnail = (canvas: HTMLCanvasElement | OffscreenCanvas, look: ModelLook, angle: number): void => {
    const context = canvas.getContext("2d");
    if (context === null || !("fillRect" in context)) return;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    const [sx, sy, sz] = look.size;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const center = [sx / 2, sy / 2, sz / 2];
    // Turned about y, then seen from above at an isometric tilt.
    const project = (x: number, y: number, z: number): readonly [number, number, number] => {
        const dx = x - center[0];
        const dz = z - center[2];
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        // Screen x and y, and depth away from the viewer, who looks down from in front.
        return [rx, (y - center[1]) * 0.82 + rz * 0.45, rz - (y - center[1]) * 0.35];
    };
    const reach = Math.hypot(sx, sy, sz) / 2 || 1;
    const unit = Math.min(width, height) / (reach * 2.1);
    const sorted = [...look.cubes].map(cube => ({ cube, depth: project(cube.at[0], cube.at[1], cube.at[2])[2] })).sort((a, b) => b.depth - a.depth);
    const faces: readonly (readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], number])[] = [
        [[0, 1, 0], [1, 0, 0], [0, 0, 1], 1],
        [[1, 0, 0], [0, 1, 0], [0, 0, 1], 0.78],
        [[0, 0, 1], [1, 0, 0], [0, 1, 0], 0.62],
        [[-1, 0, 0], [0, 1, 0], [0, 0, 1], 0.7],
        [[0, 0, -1], [1, 0, 0], [0, 1, 0], 0.55],
    ];
    for (const { cube } of sorted) {
        const half = cube.across / 2;
        for (const [normal, u, v, light] of faces) {
            // Only sides facing the viewer, toward less depth, show.
            const facing = project(cube.at[0] + normal[0], cube.at[1] + normal[1], cube.at[2] + normal[2])[2] - project(cube.at[0], cube.at[1], cube.at[2])[2];
            if (facing > 0 || (normal[1] === 0 && Math.abs(facing) < 1e-6)) continue;
            const corner = (a: number, b: number): readonly [number, number] => {
                const p = project(
                    cube.at[0] + (normal[0] + u[0] * a + v[0] * b) * half,
                    cube.at[1] + (normal[1] + u[1] * a + v[1] * b) * half,
                    cube.at[2] + (normal[2] + u[2] * a + v[2] * b) * half,
                );
                return [width / 2 + p[0] * unit, height / 2 - p[1] * unit];
            };
            context.beginPath();
            for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) context.lineTo(...corner(a, b));
            context.closePath();
            context.fillStyle = cube.color;
            context.fill();
            context.fillStyle = `rgb(0 0 0 / ${(1 - light).toFixed(2)})`;
            context.fill();
        }
    }
};
