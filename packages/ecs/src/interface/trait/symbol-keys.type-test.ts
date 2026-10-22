// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { KeysMustBeSymbols } from './symbol-keys.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const key: unique symbol;
type BuiltInTraits = { readonly type: unknown; readonly derived: true; readonly within: never; readonly reference: never; readonly reduce: never; readonly thread: never; readonly transfer: never };

// Symbol keys, and the built-in string traits, need nothing.
check<Equal<KeysMustBeSymbols<{ [key]: { type: number } }, { [key]: { type: number } }, BuiltInTraits & { readonly [key]: true }>, {}>>();
// Each kind with a string or number key requires a property naming the problem and the keys.
check<Equal<KeysMustBeSymbols<{ position: { type: number }; [key]: { type: number } }, {}, BuiltInTraits>, { readonly "component keys must be symbols": "position" }>>();
check<Equal<KeysMustBeSymbols<{}, { 1: { type: number } }, BuiltInTraits>, { readonly "resource keys must be symbols": 1 }>>();
check<Equal<KeysMustBeSymbols<{}, {}, BuiltInTraits & { readonly gpuOnly: true }>, { readonly "trait keys must be symbols": "gpuOnly" }>>();
