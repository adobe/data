import { declareName } from '../registry/names.js';
import { addTrait, isTrait } from '../registry/traits.js';
import type { Name } from './name.js';

/**
 * Claims a trait's name, in the namespace components and resources share. The same trait again, as a module evaluated
 * again registers it, is accepted. Throws for a name claimed otherwise.
 */
export const register = (name: Exclude<Name, "type"> & (string | symbol)): void => {
    if (isTrait(name)) return;
    declareName(name, "trait");
    addTrait(name);
};
