// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Declared } from './declared.js';
import { declaredOf } from '../registry/names.js';
import type { Key } from './key.js';

/** Every component its modules registered so far, with its declaration. */
export const declarations = (): ReadonlyMap<Key, Declared> => {
    // Registration takes only keys declared in `Components`, so each symbol registered as a component is one of its keys.
    const found = declaredOf("component") as ReadonlyMap<Key, Declared>;
    return found;
};
