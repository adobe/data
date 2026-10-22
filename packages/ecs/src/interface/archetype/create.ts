// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import { indexArchetype } from '../registry/archetypes.js';

/**
 * Declares an archetype, the components an entity has, listed once each: returns `components`, typed as the tuple
 * given, with a program-wide index the world finds its storage by. It goes wherever a list of components does, as any
 * readonly list of components does. Throws for a component listed twice.
 */
export const create = <const C extends readonly Component.Key[]>(components: C): C => {
    indexArchetype(components);
    return components;
};
