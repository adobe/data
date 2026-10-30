// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component, Components } from "@adobe/ecs";

/**
 * The trait marking a component or resource to persist, its value the stable name saved data names it by: unlike its
 * key's id, the name stays the same across versions and moves of its module. Not on a derived component, which its
 * rule derives again once its entity is loaded.
 */
export const persist = Symbol();

declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [persist]: N extends Component.Key ? Components[N] extends { readonly derived: true } ? never : string : string;
    }
}
