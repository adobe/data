// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Stored } from './declaration.js';

/** What `Index.create` records: its kind, its label and its declaration. */
export type Created = { readonly kind: "index"; readonly name: string; readonly declaration: Stored };
