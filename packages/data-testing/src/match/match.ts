// © 2026 Adobe. MIT License. See /LICENSE for details.

// Options controlling the tolerant structural comparison.
export interface MatchOptions {
  // Float grid that absorbs F32↔f64 storage rounding and trig epsilon. Numbers
  // are snapped to this grid before comparing. Default `0.01`.
  readonly tolerance?: number;
}

// Ordered vs. unordered is carried by the value's own type, not by configuration:
// an `Array` compares positionally (tuples like a `Vec2`, or a display-ordered
// list a case verifies), while a `Set` or `Map` compares order-independently (ecs
// entity collections materialised in nondeterministic row order). This mirrors the
// `State` modelling rule — `ReadonlyArray` means order matters, `ReadonlySet` /
// `ReadonlyMap` mean it does not.

// A `ref(label)` on the EXPECTED side asserts id CORRESPONDENCE without pinning
// the value: the first occurrence of a label binds to whatever actual value sits
// there; later occurrences of the same label must equal that binding, and two
// labels can never bind the same actual (a bijection). This checks that ecs ids
// line up structurally — e.g. a `selectedId` points at the entity a case means —
// even though the ecs assigns ids from its own space. For an id a case does not
// want to pin to a specific number, use `anyNumber` to assert only that one exists.
const REF = Symbol.for("@adobe/data-testing:ref");
export const ref = (label: string): { readonly [REF]: string } => ({ [REF]: label });
const isRef = (value: unknown): value is { readonly [REF]: string } =>
  typeof value === "object" && value !== null && REF in value;

// An asymmetric matcher (this module's `anyNumber`/`anyString`, or vitest's
// `expect.any(...)`): honored on the EXPECTED side so a case asserts a shape it
// does not pin. Recognised structurally, so no test framework is imported.
const isMatcher = (value: unknown): value is { asymmetricMatch(actual: unknown): boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

const quantize = (n: number, tolerance: number): number => {
  const factor = 1 / tolerance;
  return Math.round(Math.fround(n) * factor) / factor + 0; // `+ 0` normalises `-0` to `0`
};

// Order-independent match over a fixed pair of element lists (a `Set`'s values, or
// a `Map`'s `[key, value]` entries). Finds a perfect pairing under which every
// element matches AND all `ref` bindings stay globally consistent — so a `ref`
// correspondence may cross into an unordered collection. Backtracking (rather than
// greedy) is required because one element's binding can invalidate another's
// pairing; test collections are small, so the worst case is irrelevant. `bindings`
// is snapshotted before each tentative pairing and restored on failure.
const matchesUnordered = (
  actual: readonly unknown[],
  expected: readonly unknown[],
  options: MatchOptions,
  bindings: Map<string, unknown>,
): boolean => {
  if (actual.length !== expected.length) return false;
  const used = new Array<boolean>(actual.length).fill(false);
  const pair = (i: number): boolean => {
    if (i === expected.length) return true;
    for (let j = 0; j < actual.length; j++) {
      if (used[j]) continue;
      const snapshot = new Map(bindings);
      if (matchesWith(actual[j], expected[i], options, bindings)) {
        used[j] = true;
        if (pair(i + 1)) return true;
        used[j] = false;
      }
      // Undo any bindings the failed attempt added before trying the next candidate.
      bindings.clear();
      for (const [label, value] of snapshot) bindings.set(label, value);
    }
    return false;
  };
  return pair(0);
};

const matchesWith = (
  actual: unknown,
  expected: unknown,
  options: MatchOptions,
  bindings: Map<string, unknown>,
): boolean => {
  if (isRef(expected)) {
    const label = expected[REF];
    if (bindings.has(label)) return Object.is(bindings.get(label), actual);
    for (const bound of bindings.values()) if (Object.is(bound, actual)) return false; // injective
    bindings.set(label, actual);
    return true;
  }
  if (isMatcher(expected)) return expected.asymmetricMatch(actual);
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = options.tolerance ?? 0.01;
    return quantize(actual, tolerance) === quantize(expected, tolerance);
  }
  if (expected instanceof Set) {
    if (!(actual instanceof Set)) return false;
    return matchesUnordered([...actual], [...expected], options, bindings);
  }
  if (expected instanceof Map) {
    if (!(actual instanceof Map)) return false;
    // Compare entries as an unordered collection of `[key, value]` pairs. Keys are
    // meaningful/deterministic by convention (identity-keyed collections are Sets),
    // so pairing an expected entry to the actual entry with the equal key and a
    // matching value is exactly key-based comparison, and reports missing/extra
    // keys as a failed pairing.
    return matchesUnordered([...actual], [...expected], options, bindings);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((exp, index) => matchesWith(actual[index], exp, options, bindings));
  }
  if (expected !== null && typeof expected === "object") {
    if (
      actual === null ||
      typeof actual !== "object" ||
      Array.isArray(actual) ||
      actual instanceof Set ||
      actual instanceof Map
    )
      return false;
    const eo = expected as Record<string, unknown>;
    const ao = actual as Record<string, unknown>;
    if (Object.keys(eo).length !== Object.keys(ao).length) return false;
    return Object.keys(eo).every((key) => matchesWith(ao[key], eo[key], options, bindings));
  }
  return Object.is(actual, expected);
};

// Tolerant structural comparison: honors asymmetric matchers and `ref`
// correspondence on the expected side, absorbs float noise, and compares arrays in
// order and Sets/Maps order-independently. Pure and framework-agnostic — `assert`
// wraps it for a throwing test assertion.
export const matches = (actual: unknown, expected: unknown, options: MatchOptions = {}): boolean =>
  matchesWith(actual, expected, options, new Map());
