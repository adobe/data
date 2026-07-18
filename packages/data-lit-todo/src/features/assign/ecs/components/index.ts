// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS components for the assign feature. `name` and `assignees` are re-exported
// from main by identity (the SAME schema objects) so that when main imports this
// feature's schema plugin, `combinePlugins` dedupes them — one column, shared.
import { True } from "@adobe/data/schema";

export { name, assignees } from "../../../main/ecs/components/index.js";
export const user = True.schema; // tag: presence marks the entity as a user
