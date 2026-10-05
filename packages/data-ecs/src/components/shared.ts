import { Component } from '../component/component.js';

export const shared = Symbol('shared');

declare module '../component/types.js' {
    export interface Types {
        [shared]: true;
    }
}

Component.schemas[shared] = { type: 'boolean', const: true };;

