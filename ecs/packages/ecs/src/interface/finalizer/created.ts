// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Resolved, ResolvedChanges } from './declaration.js';

// Bodies' parameters are checked where they're created, so a finalizer holds any body.

/** Runs, inside a sync point, for each entity that stops matching its components. */
export type Leaf = {
    readonly kind: "finalizer";
    readonly name: string;
    readonly declaration: Resolved;
    body: (...parameters: never[]) => void;
};

/** Runs, inside a sync point, with all its structural changes to the components it watches. */
export type Changes = {
    readonly kind: "changes";
    readonly name: string;
    readonly declaration: ResolvedChanges;
    body: (...parameters: never[]) => void;
};

export type Finalizer = Leaf | Changes;
