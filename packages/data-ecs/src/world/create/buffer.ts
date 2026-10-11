import type { Entity } from '../../entity/entity.js';
import type { KernelCommands } from './kernel.js';

export const spawnCommand = 0;
export const despawnCommand = 1;
export const addCommand = 2;
export const removeCommand = 3;

/**
 * Commands as parallel arrays, so issuing one allocates nothing per command. Command `c` names components
 * `ids[starts[c]]` up to the next command's start, with `values` alongside (unused for `remove`).
 * Workers build the same shape and post it back.
 */
export type CommandBuffer = {
    readonly kinds: number[];
    readonly entities: Entity[];
    readonly starts: number[];
    readonly ids: number[];
    readonly values: unknown[];
};

export const createBuffer = (): CommandBuffer => ({ kinds: [], entities: [], starts: [], ids: [], values: [] });

export const clearBuffer = (buffer: CommandBuffer): void => {
    buffer.kinds.length = 0;
    buffer.entities.length = 0;
    buffer.starts.length = 0;
    buffer.ids.length = 0;
    buffer.values.length = 0;
};

/** Starts a command; push its components to `ids` (and `values`) right after. */
export const pushCommand = (buffer: CommandBuffer, kind: number, entity: Entity): void => {
    buffer.kinds.push(kind);
    buffer.entities.push(entity);
    buffer.starts.push(buffer.ids.length);
};

export const endOf = (buffer: CommandBuffer, command: number): number =>
    command + 1 < buffer.starts.length ? buffer.starts[command + 1] : buffer.ids.length;

/**
 * Commands for a kernel, writing straight into a buffer: `ids` maps the kernel's key indexes to component ids.
 * `target.buffer` may be replaced between calls.
 */
export const createKernelCommands = (target: { readonly buffer: CommandBuffer }, ids: readonly number[], reserve: () => Entity): KernelCommands => ({
    spawn: () => {
        const entity = reserve();
        pushCommand(target.buffer, spawnCommand, entity);
        return entity;
    },
    begin: (kind, entity) => pushCommand(target.buffer, kind, entity),
    value: (key, value) => {
        if (value === undefined) return;
        target.buffer.ids.push(ids[key]);
        target.buffer.values.push(value);
    },
    component: key => {
        target.buffer.ids.push(ids[key]);
        target.buffer.values.push(undefined);
    },
});
