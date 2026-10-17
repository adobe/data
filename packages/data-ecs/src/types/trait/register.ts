import { declareName } from '../registry/names.js';
import { addTrait } from '../registry/traits.js';
import type { Name } from './name.js';

/** Claims a trait's name, in the namespace components and resources share. Throws for a name already claimed. */
export const register = (name: Exclude<Name, "type"> & (string | symbol)): void => {
    declareName(name, "trait");
    addTrait(name);
};
