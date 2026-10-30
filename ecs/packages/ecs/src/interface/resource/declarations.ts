// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Declared } from '../component/declared.js';
import { declaredOf } from '../registry/names.js';
import type { Key } from './key.js';

/** Every resource its modules registered so far, with its declaration. */
export const declarations = (): ReadonlyMap<Key, Declared> => {
    // Registration takes only keys declared in `Resources`, so each symbol registered as a resource is one of its keys.
    const found = declaredOf("resource") as ReadonlyMap<Key, Declared>;
    return found;
};
