import type { Components } from '../component/types.js';
import type { Resources } from '../resource/types.js';
import type { BuiltIn } from './key.js';
import type { Traits } from './types.js';

/** A required property naming `problem` and the keys that cause it, or nothing without such keys. */
type Problem<Keys, Text extends string> = [Keys] extends [never] ? {} : { readonly [P in Text]: Keys };

/**
 * What every declaration also requires while `C`, `R` or `T` has a key that isn't a symbol, besides the built-in
 * traits: a property named for the problem, holding the keys, so registration fails to compile and says why.
 */
export type KeysMustBeSymbols<C, R, T> =
    Problem<Exclude<keyof C, symbol>, "component keys must be symbols">
    & Problem<Exclude<keyof R, symbol>, "resource keys must be symbols">
    & Problem<Exclude<keyof T, symbol | BuiltIn>, "trait keys must be symbols">;

/** `KeysMustBeSymbols` of the program's components, resources and traits, computed once. */
export type SymbolKeys = KeysMustBeSymbols<Components, Resources, Traits<never>>;
