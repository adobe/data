import type { Leaf } from '../system/leaf.js';
import { accessorsOf, declarationsOf } from './accessors.js';

/**
 * The WGSL a render system's shaders include: its bind group at `shader.group` (the heap and its table record), and a
 * function per accessor returning that component of a row, such as `fn position(row: u32) -> vec3<f32>`, plus
 * `ecs_count()`. Depends only on registered schemas, so pipelines can be built before any world exists.
 * Throws if the system isn't a render system or a component can't be read on the GPU.
 */
export const wgsl = (system: Leaf): string => {
    const { shader, name } = system.declaration;
    if (shader === undefined) throw new Error(`System "${name}" isn't a render system.`);
    const accessors = accessorsOf(shader);
    if (typeof accessors === "string") throw new Error(`Render system "${name}": ${accessors}.`);
    return declarationsOf(shader.group ?? 0, accessors);
};
