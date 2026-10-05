// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/schema";
import type { Schema } from "@adobe/data/schema";
import { Size } from "../values/size/size.js";

// An asteroid's size tier. Session scope: the game is client-local and ephemeral.
export const size = { ...Size.schema, ...Scope.session } satisfies Schema;
