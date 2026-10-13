import { createRegistry, type Registry } from "../registry/create-registry.js";
import type { Declaration } from "./declaration.js";
import type { Name } from "./name.js";

type Declarations = { readonly [K in Name]: Declaration<K> };

const registry: Registry<Declarations> = createRegistry<Declarations>("component");

export const register: Registry<Declarations>["register"] = registry.register;
export const declaration: Registry<Declarations>["declaration"] = registry.declaration;
