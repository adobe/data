// © 2026 Adobe. MIT License. See /LICENSE for details.

export function equalsShallow(a: unknown, b: unknown): boolean {
  // primitives / identical refs
  if (a === b) return true;
  if (
    a === null || b === null ||
    typeof a !== "object" || typeof b !== "object"
  ) return false;

  // arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) {
      if (aa[i] !== bb[i]) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;

  // plain objects
  let keysA = 0;
  for (const k in a as Record<string, unknown>) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k])
      return false;
    keysA++;
  }

  // ensure no extra keys in b
  let keysB = 0;
  for (const _ in b as Record<string, unknown>) keysB++;

  return keysA === keysB;
}
