// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec3 } from '@adobe/ecs';
import { enabled } from './component.enabled.js';
import { position } from './component.position.js';
import { visible } from './component.visible.js';
import { velocity } from './shared/component.velocity.js';

/** Moves each visible, enabled particle by its velocity, in a kernel on the GPU. */
export const move: System = System.create({
    kernel: "gpu",
    components: { with: [velocity, position, visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});
