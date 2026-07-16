import { Schema } from "@adobe/data/schema";
import * as components from "../../data/components/index.js";
import * as archetypes from "../../data/archetypes/index.js";

export const schema = Schema.fromArchetype(components, archetypes.Kilo);
