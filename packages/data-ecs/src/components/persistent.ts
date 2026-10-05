import { Component } from '../component/component.js';

export const persistent = Symbol('persistent');

declare module '../component/types.js' {
    export interface Types {
        [persistent]: true;
    }
}

Component.schemas[persistent] = { type: 'boolean', const: true };;

