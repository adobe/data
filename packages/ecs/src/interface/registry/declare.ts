// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createRegistry, type AnyDeclaration } from './declarations.js';
import { addTrait } from './traits.js';

const components = createRegistry("component");
const resources = createRegistry("resource");

/**
 * Registers a component as the build read it from its declaration in `Components`: the plugin emits a call after each
 * declaration, so consumers never register keys themselves.
 */
export const declareComponent = (key: unknown, declaration: AnyDeclaration): void => components(key, declaration);

/** Registers a resource as the build read it from its declaration in `Resources`. */
export const declareResource = (key: unknown, declaration: AnyDeclaration): void => resources(key, declaration);

/** Registers a trait of a consumer's own, keyed by a symbol, as the build read it from `Traits`. */
export const declareTrait = (key: unknown): void => addTrait(key);
