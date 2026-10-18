import { Component } from '../component/component.js';

/**
 * A joined thread's progress, on the entity `world.share` returns: `"joining"` until it has joined, `"joined"`, then
 * `"gone"` once it disconnected, died or couldn't join. Only the world writes it.
 */
export const threadStatus = Symbol("threadStatus");

declare module '@adobe/data-ecs' {
    export interface Components {
        [threadStatus]: typeof threadStatusTraits;
    }
}

const threadStatusTraits = Component.register(threadStatus, { type: { anyOf: [{ const: "joining" }, { const: "joined" }, { const: "gone" }] } });
