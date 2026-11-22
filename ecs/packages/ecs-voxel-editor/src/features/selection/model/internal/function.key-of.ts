// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Face } from "./type.face.js";

/** A face as a string, to tell faces apart in a set. */
export const keyOf = (face: Face): string => `${face.cell[0]},${face.cell[1]},${face.cell[2]},${face.side}`;
