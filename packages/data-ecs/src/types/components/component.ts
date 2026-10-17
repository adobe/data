import { Component } from '../component/component.js';

export const component = 'component';

declare module '@adobe/data-ecs' {
    export interface Components {
        [component]: { type: true };
    }
}

Component.register(component, { type: { const: true } });
