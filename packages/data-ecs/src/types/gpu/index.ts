import type { System } from '../system/system.js';

/**
 * The WGSL a render system's shaders include: its bind group at `shader.group` (the heap and its table record), and a
 * function per accessor returning that component of a row, such as `fn position(row: u32) -> vec3<f32>`, plus
 * `ecs_count()`. Depends only on registered schemas, so pipelines can be built before any world exists.
 * Throws if the system isn't a render system or a component can't be read on the GPU.
 */
export type Wgsl = (system: System<unknown>) => string;

/**
 * The bind group layout of `wgsl` declarations, which render pipelines take at the group they name. It's the same
 * object for a device every time, so pipelines can be built before a world exists.
 */
export type Layout = (device: GPUDevice) => GPUBindGroupLayout;
