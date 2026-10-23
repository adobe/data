// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createRegistry, type AnyDeclaration } from './declarations.js';
import { addTrait } from './traits.js';

/*
 * The registry's hooks for code the plugin generates, which `@adobe/ecs/declare` exports: the plugin registers each
 * key's declaration in `Components`, `Resources` and `Traits` through them, after the key. They're named with `$`, as
 * the plugin's other generated names are, since consumers never call them.
 */

const components = createRegistry("component");
const resources = createRegistry("resource");

/** Registers a component as the build read it from its declaration in `Components`. */
export const declareComponent$ = (key: unknown, declaration: AnyDeclaration): void => components(key, declaration);

/** Registers a resource as the build read it from its declaration in `Resources`. */
export const declareResource$ = (key: unknown, declaration: AnyDeclaration): void => resources(key, declaration);

/** Registers a trait of a consumer's own, keyed by a symbol, as the build read it from `Traits`. */
export const declareTrait$ = (key: unknown): void => addTrait(key);
