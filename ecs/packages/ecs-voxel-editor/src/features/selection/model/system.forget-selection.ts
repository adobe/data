// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "@adobe/ecs";
import { namedSelections } from "./resource.named-selections.js";

/** Forgets the selection saved under a name. */
export const forgetSelection: System<{ readonly name: string }> = System.create({}, ({ resources }, input: { readonly name: string }) => {
    const saved = resources[namedSelections];
    if (saved === null || !saved.has(input.name)) return;
    resources[namedSelections] = new Map([...saved].filter(([name]) => name !== input.name));
});
