import { createRegistry } from "../registry/declarations.js";
import type { Registry } from "../registry/registry.js";
import type { Resource } from "../resource/resource.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Declaration } from "./declaration.js";
import type { Key } from "./key.js";

/** A name also declared as a resource or a trait can't be registered: names are unique across the three. */
type Declarations = { readonly [K in Key]: K extends Resource.Key | TraitKey ? never : Declaration<K> };

const registry: Registry<Declarations> = createRegistry<Declarations>("component");

export const register: Registry<Declarations>["register"] = registry.register;
