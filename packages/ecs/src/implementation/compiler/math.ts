// © 2026 Adobe. MIT License. See /LICENSE for details.
/** The `Math` functions allowed in kernels: pure and deterministic. */
export const mathFunctions: ReadonlySet<string> = new Set([
    "abs", "sign", "floor", "ceil", "round", "trunc", "min", "max", "sqrt", "cbrt", "hypot",
    "exp", "expm1", "log", "log1p", "log2", "log10", "pow",
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
    "fround", "imul", "clz32",
]);

export const mathConstants: ReadonlySet<string> = new Set(["PI", "E", "LN2", "LN10", "LOG2E", "LOG10E", "SQRT2", "SQRT1_2"]);
