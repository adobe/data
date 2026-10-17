import { createRegistry } from "../registry/declarations.js";
import type { Registry } from "../registry/registry.js";
import type { Resource } from "../resource/resource.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Declaration } from "./declaration.js";
import type { Name } from "./name.js";

/** A name also declared as a resource or a trait can't be registered: names are unique across the three. */
type Declarations = { readonly [K in Name]: K extends Resource.Name | TraitName ? never : Declaration<K> };

const registry: Registry<Declarations> = createRegistry<Declarations>("component");

export const register: Registry<Declarations>["register"] = registry.register;
