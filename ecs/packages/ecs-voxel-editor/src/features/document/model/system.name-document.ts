// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { document } from "./resource.document.js";

/** Names the document's file: the library path it's saved to, or null for a new document not yet saved. */
export const nameDocument: System<{ readonly path: string | null }> = System.create({}, ({ resources }, input: { readonly path: string | null }) => {
    if (resources[document].path !== input.path) resources[document] = { path: input.path };
});
