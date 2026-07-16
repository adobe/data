// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";
import * as components from "../../data/components/index.js";
import * as archetypes from "../../data/archetypes/index.js";

export const schema = Schema.fromArchetype(components, archetypes.Todo);
