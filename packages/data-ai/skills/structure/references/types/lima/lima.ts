import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Lima = Schema.ToType<typeof schema>;
export * as Lima from "./public.js";
