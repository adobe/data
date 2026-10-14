import { Component } from '../component/component.js';

export const shared = 'shared';

declare module '@adobe/data-ecs' {
    export interface Components {
        [shared]: { type: true };
    }
}

Component.register(shared, { type: { const: true } });
