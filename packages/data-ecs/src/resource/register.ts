import { createRegistry, type Registry } from "../registry/create-registry.js";
import type { Declaration } from "./declaration.js";
import type { Name } from "./name.js";
import type { Component } from "../component/component.js";
import type { Name as TraitName } from "../trait/name.js";

/** A name also declared as a component or a trait can't be registered: names are unique across the three. */
type Declarations = { readonly [K in Name]: K extends Component.Name | TraitName ? never : Declaration<K> };

const registry: Registry<Declarations> = createRegistry<Declarations>("resource");

export const register: Registry<Declarations>["register"] = registry.register;
export const declaration: Registry<Declarations>["declaration"] = registry.declaration;
