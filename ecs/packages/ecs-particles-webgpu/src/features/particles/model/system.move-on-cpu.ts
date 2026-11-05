// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, Vec3 } from '@adobe/ecs';
import { enabled } from './component.enabled.js';
import { position } from './component.position.js';
import { visible } from './component.visible.js';
import { velocity } from './shared/motion.js';

/** `move` in a kernel on the world's workers, for comparison. */
export const moveOnCpu: System = System.create({
    kernel: true,
    components: { with: [velocity, position, visible, enabled] },
}, row => {
    row[position] = Vec3.add(row[position], row[velocity]);
});
