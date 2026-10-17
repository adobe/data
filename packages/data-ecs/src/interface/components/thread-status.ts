import { Component } from '../component/component.js';

/** On a joined thread's entity: whether it's joining, joined, or gone. */
export const threadStatus = 'threadStatus';

declare module '@adobe/data-ecs' {
    export interface Components {
        [threadStatus]: { type: "joining" | "joined" | "gone" };
    }
}

Component.register(threadStatus, { type: { anyOf: [{ const: "joining" }, { const: "joined" }, { const: "gone" }] } });
