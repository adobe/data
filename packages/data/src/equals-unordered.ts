// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Deep equality that **ignores ordering**: arrays are compared as multisets
 * (same elements, any order) and objects by key/value regardless of key order.
 *
 * For JSON-style values — primitives, plain objects, and arrays. Use `equals`
 * for the faster order-sensitive variant (and for typed buffers, which are
 * ordered sequences).
 *
 * Array matching is O(n²) (each element pairs with a distinct partner), which
 * is intended for modest collections such as a conformance `State`, not large
 * hot-path arrays.
 */
export function equalsUnordered(a: unknown, b: unknown): boolean {
  // 1  Primitives / identical reference
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  // 2  Arrays — multiset match. `equalsUnordered` is an equivalence relation,
  //    so equal elements are interchangeable and greedy first-match finds a
  //    perfect pairing iff one exists.
  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr || bIsArr) {
    if (aIsArr !== bIsArr) return false;
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    const used = new Array<boolean>(bb.length).fill(false);
    for (const x of aa) {
      let matched = false;
      for (let j = 0; j < bb.length; j++) {
        if (!used[j] && equalsUnordered(x, bb[j])) {
          used[j] = true;
          matched = true;
          break;
        }
      }
      if (!matched) return false;
    }
    return true;
  }

  // 3  Plain objects — key order irrelevant.
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  let keyBalance = 0;
  for (const k in ao) {
    keyBalance++;
    if (!(k in bo)) return false;
    if (!equalsUnordered(ao[k], bo[k])) return false;
  }
  for (const _ in bo) keyBalance--;
  return keyBalance === 0;
}
