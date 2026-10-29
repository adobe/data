// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../../component/component.js';
import type { Column } from './index.js';

/** The rows of one archetype: their entities in row order, and a column for each component asked for that it holds. */
export type Table = {
    readonly count: number;
    readonly entities: Float64Array;
    readonly columns: { readonly [K in Component.Key]?: Column };
};

export type * as Table from './index.js';
