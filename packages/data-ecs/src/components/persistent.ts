import { Component } from '../component/component.js';

export const persistent = 'persistent';

declare module '../component/types.js' {
    export interface Types {
        [persistent]: { type: true };
    }
}

Component.register(persistent, { type: { const: true } });
