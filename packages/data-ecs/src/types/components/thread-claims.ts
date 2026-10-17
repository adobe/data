import { Component } from '../component/component.js';
import type { Thread } from '../thread/thread.js';

/** On a joined thread's entity: the logical threads it fills. */
export const threadClaims = 'threadClaims';

declare module '@adobe/data-ecs' {
    export interface Components {
        [threadClaims]: { type: readonly Thread[] };
    }
}

Component.register(threadClaims, { type: { type: "array", items: { type: "string" } } });
