import type { Entity } from '../../entity/entity.js';
import type { Commands } from '../../system/commands.js';
import { reserve } from './entities.js';
import { idOf, type State } from './state.js';

/** Commands that queue for the next sync point. Unregistered components throw here, inside the issuing system. Commands can't touch the resource entity. */
export const createCommands = (state: State): Commands => {
    /** Values are immutable by convention, so commands hold them without copying. */
    const check = (values: object): object => {
        for (const key of Reflect.ownKeys(values)) idOf(state, key);
        return values;
    };
    const user = (entity: Entity): boolean => entity !== state.resourceEntity;
    return {
        spawn: values => {
            const copy = check(values);
            const entity = reserve(state.entities);
            state.commands.push({ kind: "spawn", entity, values: copy });
            return entity;
        },
        despawn: entity => {
            if (user(entity)) state.commands.push({ kind: "despawn", entity });
        },
        add: (entity, values) => {
            const copy = check(values);
            if (user(entity)) state.commands.push({ kind: "add", entity, values: copy });
        },
        remove: (entity, ...components) => {
            for (const key of components) idOf(state, key);
            if (user(entity)) state.commands.push({ kind: "remove", entity, components: [...components] });
        },
    };
};
