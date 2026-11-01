// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';
import type { CommandLists } from './access.js';
import type { Resolved } from './declaration.js';
import type { Name } from './name.js';

/** The schema of a body's input: an object of named fields. */
export type InputSchema = Extract<Schema, { readonly type: "object" }>;

/**
 * A system that runs a body: `"render"` for one made by `render`, `"system"` otherwise. Its body's parameters are
 * checked where it's created, so a leaf holds any body. `input` is the schema of its body's input, which the plugin
 * gives from the type of the body's parameter after its context, or undefined; every leaf has it, so leaves share a shape.
 */
export type Leaf = {
    readonly kind: "system" | "render";
    readonly name: Name;
    readonly declaration: Resolved;
    readonly input: InputSchema | undefined;
    readonly body: (...parameters: never[]) => void;
    /**
     * What its body's commands name, as the build inferred them, read at first need: null where it couldn't follow
     * them, undefined for none. Apart from its declaration, so a module evaluated again with other commands declares the
     * same system.
     */
    readonly commands: () => CommandLists | null | undefined;
};
