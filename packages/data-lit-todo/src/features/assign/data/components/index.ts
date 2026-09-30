// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "@adobe/data/types";
import { components as mainComponents } from "../../../main/data/components/index.js";
import { user } from "./user.js";
import { assignees } from "./assignees.js";

// This feature's vocabulary: main's components (reused by identity) plus its own.
export const components = { ...mainComponents, user, assignees };

// Own names must not shadow a lower feature's (a spread would overwrite silently).
type _NoShadow = Assert<Equal<Extract<"user" | "assignees", keyof typeof mainComponents>, never>>;
