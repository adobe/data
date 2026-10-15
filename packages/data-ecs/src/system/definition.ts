import type { Composite } from './composite.js';
import type { Leaf } from './leaf.js';
import type { Name } from './name.js';
import type { System } from './system.js';

/** What the implementation knows of a system: the value a constructor returned, with its kind, declaration and body. */
export type Definition = Leaf | Composite;

/** Only constructors make values with a system's kind and a declaration. */
const isDefinition = (system: System<unknown>): system is System<unknown> & Definition =>
    "declaration" in system && "kind" in system && (system.kind === "system" || system.kind === "render" || system.kind === "composite");

/** A system's definition, or undefined for a value no constructor returned. */
export const definitionOf = (system: System<unknown>): Definition | undefined => isDefinition(system) ? system : undefined;

/** A system's definition. Throws for a value no constructor returned. */
export const requireDefinition = (system: System<unknown>): Definition => {
    const definition = definitionOf(system);
    if (definition === undefined) throw new Error(`"${String(system.name)}" isn't a system a System constructor returned.`);
    return definition;
};
