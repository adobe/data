// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as persistentComponents from "../../persistent-database/components/index.js";
import * as sessionComponents from "../components/index.js";

// The archetype packs a todo's persistent columns together with its transient
// `dragPosition` slot for efficient iteration, so its keys span both the
// persistent and session component sets.
const components = { ...persistentComponents, ...sessionComponents };

export const Todo = [
  "todo",
  "name",
  "complete",
  "order",
  "dragPosition",
  "assignees",
] as const satisfies ReadonlyArray<keyof typeof components>;
