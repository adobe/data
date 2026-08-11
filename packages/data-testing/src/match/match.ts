// © 2026 Adobe. MIT License. See /LICENSE for details.

// Options controlling the tolerant structural comparison.
export interface MatchOptions {
  // Object keys whose array values compare as multisets (order-independent) at
  // any depth — for ecs entity collections materialised in nondeterministic row
  // order. Every other array stays order-sensitive (positional tuples like a
  // `Vec2`, or a display-ordered list whose order a case verifies).
  readonly unordered?: ReadonlySet<string>;
  // Float grid that absorbs F32↔f64 storage rounding and trig epsilon. Numbers
  // are snapped to this grid before comparing. Default `0.01`.
  readonly tolerance?: number;
}

// A `ref(label)` on the EXPECTED side asserts id CORRESPONDENCE without pinning
// the value: the first occurrence of a label binds to whatever actual value sits
// there; later occurrences of the same label must equal that binding, and two
// labels can never bind the same actual (a bijection). This checks that ecs ids
// line up structurally — e.g. a `selectedId` points at the entity a case means —
// even though the ecs assigns ids from its own space. For an id a case does not
// care about, use `anyNumber` instead.
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

// Multiset (order-independent) match: greedy pairing, sufficient for concrete
// values. Elements compare with the ordered, matcher-aware path; `ref` bindings
// do not cross element boundaries here (ids in bags are `anyNumber`, not refs).
const matchesUnordered = (
  actual: readonly unknown[],
  expected: readonly unknown[],
  options: MatchOptions,
): boolean => {
  if (actual.length !== expected.length) return false;
  const used = new Array<boolean>(actual.length).fill(false);
  return expected.every((exp) => {
    const index = actual.findIndex((act, i) => !used[i] && matchesWith(act, exp, options, new Map()));
    if (index < 0) return false;
    used[index] = true;
    return true;
  });
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
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((exp, index) => matchesWith(actual[index], exp, options, bindings));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const expectedKeys = Object.keys(expected as object);
    const actualKeys = Object.keys(actual as object);
    if (expectedKeys.length !== actualKeys.length) return false;
    return expectedKeys.every((key) => {
      const exp = (expected as Record<string, unknown>)[key];
      const act = (actual as Record<string, unknown>)[key];
      if (options.unordered?.has(key) && Array.isArray(exp) && Array.isArray(act)) {
        return matchesUnordered(act, exp, options);
      }
      return matchesWith(act, exp, options, bindings);
    });
  }
  return Object.is(actual, expected);
};

// Tolerant structural comparison: honors asymmetric matchers and `ref`
// correspondence on the expected side, absorbs float noise, and compares arrays
// in order except where `options.unordered` names a multiset collection. Pure
// and framework-agnostic — `assert` wraps it for a throwing test assertion.
export const matches = (actual: unknown, expected: unknown, options: MatchOptions = {}): boolean =>
  matchesWith(actual, expected, options, new Map());
