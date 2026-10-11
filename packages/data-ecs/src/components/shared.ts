import { Component } from '../component/component.js';

export const shared = 'shared';

declare module '../component/types.js' {
    export interface Types {
        [shared]: true;
    }
}

Component.register(shared, { const: true });
