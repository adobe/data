// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Component } from '../component/component.js';
import type { errors, run } from './components.js';

/**
 * A report's values, as rows and lookups give them. After the sync point of each run and tick, before its observer
 * systems, the world writes its report, an entity it keeps for recent runs: `errors` is there only when something went
 * wrong. Once a run resolves, its report is there. Queries that require no component don't see reports.
 */
export type Report = { readonly [run]: Component.Value<typeof run>; readonly [errors]?: Component.Value<typeof errors> };

export * as Report from './index.js';
