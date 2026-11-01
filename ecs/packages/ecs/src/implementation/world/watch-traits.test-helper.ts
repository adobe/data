// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A trait of the document's: what changes finalizers watching it see. */
export const inDocument = Symbol("watchTraits/inDocument");

declare module "@adobe/ecs" {
    export interface Traits<N> {
        readonly [inDocument]: N extends unknown ? true : never;
    }
}
