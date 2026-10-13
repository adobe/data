import { Component } from '../component/component.js';

export const component = 'component';

declare module '../component/types.js' {
    export interface Types {
        [component]: { type: true };
    }
}

Component.register(component, { type: { const: true } });
