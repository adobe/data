import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type WorkspaceDocument = Schema.ToType<typeof schema>;
export * as WorkspaceDocument from "./public.js";
