// © 2026 Adobe. MIT License. See /LICENSE for details.

import { isTypedBuffer } from "./typed-buffer/is-typed-buffer.js";
import { typedBufferEquals } from "./typed-buffer/typed-buffer-equals.js";

/**
 * Very-fast deep equality for JSON-style values.
 *
 * Assumptions
 * ───────────
 * • Only JSON primitives, plain objects, and arrays appear.
 * • Objects have **no prototype chain** (so every enumerable key is "own,"
 *   letting us skip costly `hasOwnProperty` checks).
 * • No cyclic references (add a WeakMap if you need that).
 */
export function equals(a: unknown, b: unknown): boolean {
  // 1  Primitives / identical reference
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // 2  Arrays
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr || bIsArr) {
    if (aIsArr !== bIsArr) return false;
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (!equals(aa[i], bb[i])) return false;
    }
    return true;
  }

  // 3  Typed-buffer fast path
  const aBuf = isTypedBuffer(a);
  const bBuf = isTypedBuffer(b);
  if (aBuf || bBuf) {
    return aBuf && bBuf ? typedBufferEquals(a as any, b as any) : false;
  }

  // 4  Plain objects
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;

  let keyBalance = 0;

  for (const k in ao) {
    keyBalance++;
    if (!(k in bo)) return false;
    if (!equals(ao[k], bo[k])) return false;
  }
  for (const _ in bo) keyBalance--;

  return keyBalance === 0;
}
