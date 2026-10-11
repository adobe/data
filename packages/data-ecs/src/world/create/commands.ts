import type { Commands } from '../../system/commands.js';
import { reserve } from './entities.js';
import { idOf, type Command, type State } from './state.js';

/** Commands that queue for the next sync point. Unregistered components throw here, inside the issuing system. */
export const createCommands = (state: State, target: { readonly buffer: Command[] }): Commands => {
    /** Values are immutable by convention, so commands hold them without copying. */
    const check = (values: object): object => {
        for (const key of Reflect.ownKeys(values)) idOf(state, key);
        return values;
    };
    return {
        spawn: values => {
            const copy = check(values);
            const entity = reserve(state.entities);
            target.buffer.push({ kind: "spawn", entity, values: copy });
            return entity;
        },
        despawn: entity => {
            target.buffer.push({ kind: "despawn", entity });
        },
        add: (entity, values) => {
            const copy = check(values);
            target.buffer.push({ kind: "add", entity, values: copy });
        },
        remove: (entity, ...components) => {
            for (const key of components) idOf(state, key);
            target.buffer.push({ kind: "remove", entity, components: [...components] });
        },
    };
};
