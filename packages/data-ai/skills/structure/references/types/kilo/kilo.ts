import type { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Kilo = Schema.ToType<typeof schema>;
export * as Kilo from "./public.js";
