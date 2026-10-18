import { addTrait } from '../registry/traits.js';
import type { BuiltIn, Name } from './name.js';

/**
 * Registers a trait under `key`, a plain `Symbol(...)`: string trait names are the core's built-in traits. The same
 * trait again is accepted, and so is a new symbol with a trait's id, as a module evaluated again makes it. Throws for a key that isn't a plain symbol, or
 * one registered as a component or resource.
 */
export const register = (key: Exclude<Name, BuiltIn> & symbol): void => addTrait(key);
