// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert, Equal } from "../../../types/index.js";
import { Boolean, F32, True } from "../../../schema/index.js";
import { Database } from "../database.js";

const components = { todo: True.schema, name: { type: "string" }, complete: Boolean.schema, order: F32.schema } as const;

// An entity tuple may name built-in marker components; its value type omits them and keeps tags.
const Cursor = ["todo", "name", "nonPersistent", "nonShared"] as const satisfies Database.EntityComponents<typeof components>;
type _Cursor = Assert<Equal<Database.EntityType<typeof components, typeof Cursor>, { readonly todo: true; readonly name: string }>>;

const Todo = ["name", "complete", "order"] as const satisfies Database.EntityComponents<typeof components>;
type _Todo = Assert<Equal<Database.EntityType<typeof components, typeof Todo>, { readonly name: string; readonly complete: boolean; readonly order: number }>>;

// Archetypes accept the marker components too.
export const archetypes = Database.archetypes(components, { Cursor, Session: ["name", "nonPersistent", "nonShared"] });

// @ts-expect-error — an unknown component name is rejected
export const bad = ["nope"] as const satisfies Database.EntityComponents<typeof components>;
