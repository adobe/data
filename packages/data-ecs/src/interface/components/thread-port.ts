import { Component } from '../component/component.js';

/** On a joined thread's entity: the port the world reaches that thread through. */
export const threadPort = 'threadPort';

declare module '@adobe/data-ecs' {
    export interface Components {
        [threadPort]: { type: MessagePort; transfer: true };
    }
}

Component.register(threadPort, { transfer: true });
