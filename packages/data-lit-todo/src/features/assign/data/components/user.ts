// © 2026 Adobe. MIT License. See /LICENSE for details.
import { True } from "@adobe/data/schema";

// Tag: marks an entity as a user. Needed because a user's other component (`name`)
// is a subset of a todo's, so without it a user query would also match todos.
export const user = True.schema;
