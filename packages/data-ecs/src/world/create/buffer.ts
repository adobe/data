import type { Entity } from '../../entity/entity.js';

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

/** Appends `source`'s commands, except those naming `skipped`. */
export const appendBuffer = (target: CommandBuffer, source: CommandBuffer, skipped: Entity): void => {
    for (let command = 0; command < source.kinds.length; command++) {
        const entity = source.entities[command];
        if (entity === skipped) continue;
        pushCommand(target, source.kinds[command], entity);
        for (let k = source.starts[command], end = endOf(source, command); k < end; k++) {
            target.ids.push(source.ids[k]);
            target.values.push(source.values[k]);
        }
    }
};
