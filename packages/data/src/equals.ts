// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { ReadonlyTypedBuffer } from "./typed-buffer/typed-buffer.js";

// Typed-buffer brand emitted by `TypedBuffer`'s `__brand` field. Duck-typed
// here (instead of `instanceof TypedBuffer`) so this module has no runtime
// dependency on `typed-buffer/` — `equals` is the mutual-recursion partner
// of `typedBufferEquals`, and importing the class would close the cycle
// `equals → is-typed-buffer → typed-buffer → typed-buffer-equals → equals`.
const TYPED_BUFFER_BRAND = "TypedBuffer";

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

  // 2b  Sets & Maps — membership is order-independent, but each element/entry
  //     recurses through `equals` (so an array *inside* a Set stays ordered). A
  //     Map's entries compare as `[key, value]` pairs. O(n²) greedy pairing, which
  //     is exact because `equals` is an equivalence relation; intended for modest
  //     collections, not large hot-path Sets/Maps.
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    return multisetEquals([...a], [...b]);
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) return false;
    return multisetEquals([...a], [...b]);
  }

  // 3  Typed-buffer fast path. Inlined here (rather than dispatched to
  // `typedBufferEquals`) so the recursion stays intra-module; see the
  // brand comment above.
  const aBuf = (a as { __brand?: string }).__brand === TYPED_BUFFER_BRAND;
  const bBuf = (b as { __brand?: string }).__brand === TYPED_BUFFER_BRAND;
  if (aBuf || bBuf) {
    if (!aBuf || !bBuf) return false;
    const ab = a as ReadonlyTypedBuffer<unknown>;
    const bb = b as ReadonlyTypedBuffer<unknown>;
    if (ab.type !== bb.type || ab.capacity !== bb.capacity) return false;
    if (!equals(ab.schema, bb.schema)) return false;
    for (let i = 0; i < ab.capacity; i++) {
      if (!equals(ab.get(i), bb.get(i))) return false;
    }
    return true;
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

// Multiset equality: same length and every element of `aa` pairs with a distinct
// `equals` partner in `bb`. Greedy first-match is exact because `equals` is an
// equivalence relation, so equal elements are interchangeable.
function multisetEquals(aa: readonly unknown[], bb: readonly unknown[]): boolean {
  if (aa.length !== bb.length) return false;
  const used = new Array<boolean>(bb.length).fill(false);
  for (const x of aa) {
    let matched = false;
    for (let j = 0; j < bb.length; j++) {
      if (!used[j] && equals(x, bb[j])) {
        used[j] = true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}
