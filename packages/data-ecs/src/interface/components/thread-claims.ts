import { Component } from '../component/component.js';

/** The logical threads a joined thread claims, on the entity `world.share` returns; none until it has joined. Only the world writes it. */
export const threadClaims = Symbol("threadClaims");

declare module '@adobe/data-ecs' {
    export interface Components {
        [threadClaims]: typeof threadClaimsTraits;
    }
}

const threadClaimsTraits = Component.register(threadClaims, { type: { type: "array", items: { type: "string" } } });
