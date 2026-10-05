import { Component } from '../component/component.js';

export const component = 'component';

declare module '../component/types.js' {
    export interface Types {
        [component]: true;
    }
}

Component.schemas[component] = { type: 'boolean', const: true };;

