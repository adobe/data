import { declareName } from '../registry/declare-name.js';
import type { Name } from './name.js';

const registered = new Set<string | symbol>(["type"]);
declareName("type", "trait");

/** Claims a trait's name, in the namespace components and resources share. Throws on a duplicate, except a trait's own. */
export const register = (name: Exclude<Name, "type"> & (string | symbol)): void => {
    // A module evaluated again registers its trait again.
    if (registered.has(name)) return;
    declareName(name, "trait");
    registered.add(name);
};

/** Whether `name` is a registered trait. */
export const isTrait = (name: string | symbol): boolean => registered.has(name);

register("derived");
register("within");
register("reference");
register("reduce");
