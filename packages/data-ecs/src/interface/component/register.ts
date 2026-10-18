import { createRegistry, type GivenDeclaration } from "../registry/declarations.js";
import type { Resource } from "../resource/resource.js";
import type { ValueOf } from "../trait/entry.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Shape } from "../trait/shape.js";
import type { Declaration } from "./declaration.js";
import type { Key } from "./key.js";

const registry = createRegistry("component");

/**
 * Registers a component under `key`, a plain `Symbol(...)` declared in `Components`, and returns its augment entry:
 * the declaration's traits, `type` as the value type its schema describes, or `object<T>()` states.
 * ```ts
 * const positionTraits = Component.register(position, { type: Vec3.schema });
 * declare module "@adobe/data-ecs" { interface Components { [position]: typeof positionTraits } }
 * ```
 * The declaration is fixed from then on. The same declaration again is accepted, and so is a new symbol with the id
 * of a component, as a module evaluated again makes it, which is then that key. A key also declared as a resource or
 * a trait can't be registered: names are unique across the three. Throws for a key that isn't a plain symbol (a
 * `Symbol.for` or well-known symbol isn't), one registered, or whose id is registered, as another kind or with another
 * declaration, a trait that isn't registered, a trait's value that can't hold for the declaration, or a schema asking
 * for a GPU layout it can't meet.
 */
export function register<K extends Exclude<Key, Resource.Key | TraitKey> & symbol, const D extends Shape>(key: K, declaration: Declaration<K, D>): { readonly [T in keyof D as T extends "default" ? never : T]: T extends "type" ? ValueOf<D[T]> : D[T] };
export function register(key: unknown, declaration: GivenDeclaration): GivenDeclaration {
    return registry(key, declaration);
}
