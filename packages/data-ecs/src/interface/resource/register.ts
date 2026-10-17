import type { Component } from "../component/component.js";
import { createRegistry, type Registry } from "../registry/declarations.js";
import type { Name as TraitName } from "../trait/name.js";
import type { Declaration } from "./declaration.js";
import type { Name } from "./name.js";

/** A name also declared as a component or a trait can't be registered: names are unique across the three. */
type Declarations = { readonly [K in Name]: K extends Component.Name | TraitName ? never : Declaration<K> };

const registry: Registry<Declarations> = createRegistry<Declarations>("resource");

export const register: Registry<Declarations>["register"] = registry.register;
