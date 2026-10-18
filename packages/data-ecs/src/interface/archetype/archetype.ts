import type { Component } from '../component/component.js';

/** The components an entity has, listed once each: from `Archetype.create`, or any readonly list of components. */
export type Archetype = readonly Component.Key[];

export * as Archetype from './index.js';
