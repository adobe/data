import { createRegistry, type AnyDeclaration } from "../registry/declarations.js";
import type { Resource } from "../resource/resource.js";
import type { Schema } from "../schema/schema.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Declaration } from "./declaration.js";
import type { Key } from "./key.js";

const registry = createRegistry("component");

/**
 * Registers the component `key`, a plain `Symbol(...)` whose traits `Components` declares, with exactly those traits:
 * `type` as a schema that describes the declared type, left out only for a type that isn't data, which is stored as
 * it is.
 * ```ts
 * declare module "@adobe/ecs" { interface Components { [position]: { type: Vec3 } } }
 * Component.register(position, { type: Vec3.schema });
 * ```
 * The declaration is fixed from then on. The same declaration again is accepted, and so is a new symbol with the id
 * of a component, as a module evaluated again makes it, which is then that key. A key also declared as a resource or
 * a trait can't be registered: names are unique across the three. Throws for a key that isn't a plain symbol (a
 * `Symbol.for` or well-known symbol isn't), one registered, or whose id is registered, as another kind or with another
 * declaration, a trait that isn't registered, a trait's value that can't hold for the declaration, or a schema asking
 * for a GPU layout it can't meet.
 */
export function register<K extends Exclude<Key, Resource.Key | TraitKey> & symbol, const S extends Schema & { readonly default?: unknown } = never>(key: K, declaration: Declaration<K, S>): void;
export function register(key: unknown, declaration: AnyDeclaration): void {
    registry(key, declaration);
}
