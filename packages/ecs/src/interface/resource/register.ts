// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from "../component/component.js";
import { createRegistry, type AnyDeclaration } from "../registry/declarations.js";
import type { Schema } from "../schema/schema.js";
import type { Key as TraitKey } from "../trait/key.js";
import type { Declaration } from "./declaration.js";
import type { Key } from "./key.js";

const registry = createRegistry("resource");

/**
 * Registers the resource `key`, a plain `Symbol(...)` whose traits `Resources` declares, as `Component.register`
 * does: `Resource.register(gravity, { type: { type: "number", default: -9.8 } })`. A resource always has a value: its
 * schema's `default` or the declaration's, either left out only when its type allows `null`, which it then starts at.
 */
export function register<K extends Exclude<Key, Component.Key | TraitKey> & symbol, const S extends Schema & { readonly default?: unknown } = never>(key: K, declaration: Declaration<K, S>): void;
export function register(key: unknown, declaration: AnyDeclaration): void {
    registry(key, declaration);
}
