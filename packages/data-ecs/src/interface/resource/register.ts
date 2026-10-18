import type { Component } from "../component/component.js";
import { createRegistry, type GivenDeclaration } from "../registry/declarations.js";
import type { ValueOf } from "../trait/entry.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Shape } from "../trait/shape.js";
import type { Declaration } from "./declaration.js";
import type { Key } from "./key.js";

const registry = createRegistry("resource");

/**
 * Registers a resource under `key`, a plain `Symbol(...)` declared in `Resources`, and returns its augment entry, as
 * `Component.register` does: `const gravityTraits = Resource.register(gravity, { type: { type: "number", default: 0 } })`.
 * A resource always has a value: its schema's `default`, or the declaration's beside `object<T>()`, either left out
 * only when its type allows `null`.
 */
export function register<K extends Exclude<Key, Component.Key | TraitKey> & symbol, const D extends Shape>(key: K, declaration: Declaration<K, D>): { readonly [T in keyof D as T extends "default" ? never : T]: T extends "type" ? ValueOf<D[T]> : D[T] };
export function register(key: unknown, declaration: GivenDeclaration): GivenDeclaration {
    return registry(key, declaration);
}
