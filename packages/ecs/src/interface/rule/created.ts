// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Stored } from './declaration.js';

/** A rule: entities matching its components have the components it derives. */
export type Rule = { readonly kind: "rule"; readonly name: string; readonly declaration: Stored };
