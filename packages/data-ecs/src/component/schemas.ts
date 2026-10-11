import { createRegistry, type Registry } from "../registry/create-registry.js";
import type { Schema } from "../schema/schema.js";
import type { Types } from "./types.js";

type Declarations = { [K in keyof Types]: Schema.ForType<Types[K]> };

const registry: Registry<Declarations> = createRegistry<Declarations>("component");

export const schemas: Registry<Declarations>["schemas"] = registry.schemas;
export const register: Registry<Declarations>["register"] = registry.register;
