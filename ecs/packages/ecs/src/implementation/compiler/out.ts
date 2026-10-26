// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Statement } from './ir.js';

/** Emitted statements. A function is resolved last, so it can see what the rest of the body needed. */
export type Out = (Statement | (() => readonly Statement[]))[];

export const resolve = (out: Out): readonly Statement[] => out.flatMap(item => typeof item === "function" ? item() : [item]);
