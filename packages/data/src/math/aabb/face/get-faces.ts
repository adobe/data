// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Face } from "./face.js";
import { FACES } from "./internals.js";

/** Yields each single-face bit set in `face` */
export function* getFaces(face: Face): IterableIterator<Face> {
    for (const f of FACES) {
        if (face & f) {
            yield f;
        }
    }
}
