// © 2026 Adobe. MIT License. See /LICENSE for details.
import { definitionOf } from '../registry/index.js';
import type { System } from '../system/system.js';
import { accessorsOf, declarationsOf } from './accessors.js';

/**
 * The WGSL a render system's shaders include: its bind group at `shader.group` (the heap and its table record), and a
 * function per accessor returning that component of a row, such as `fn position(row: u32) -> vec3<f32>`, plus
 * `ecs_count()`. For a system with `order`, `row` is an instance's position in its order and `ecs_count()` the number
 * of instances. Depends only on registered schemas, so pipelines can be built before any world exists.
 * Throws if the system isn't a render system or a component can't be read on the GPU.
 */
export const wgsl = (system: System<unknown>): string => {
    const definition = definitionOf(system);
    const declaration = definition?.kind === "render" ? definition.declaration : undefined;
    const shader = declaration?.shader;
    if (declaration === undefined || shader === undefined) throw new Error(`System "${system.name}" isn't a render system.`);
    const { name } = system;
    const ordered = declaration.order !== undefined;
    const accessors = accessorsOf(shader, ordered);
    if (typeof accessors === "string") throw new Error(`Render system "${name}": ${accessors}.`);
    return declarationsOf(shader.group ?? 0, accessors, ordered);
};
