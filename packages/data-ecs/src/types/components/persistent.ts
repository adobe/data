import { Component } from '../component/component.js';

export const persistent = 'persistent';

declare module '@adobe/data-ecs' {
    export interface Components {
        [persistent]: { type: true };
    }
}

Component.register(persistent, { type: { const: true } });
