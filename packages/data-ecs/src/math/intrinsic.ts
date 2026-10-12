import type { Program } from "../world/create/kernel.js";

/**
 * Declares the WGSL builtin a math function matches, so GPU kernels emit `wgsl` for calls to it: a function, or with
 * `form`, an operator between or before its operands. Other backends inline `implementation`, which is returned as is.
 * The compiler reads the declaration from source, so it is written as literals.
 */
export const intrinsic = <F>(
    declaration: { readonly wgsl: string; readonly form?: "infix" | "prefix"; readonly parameters: readonly Program.ValueType[]; readonly result: Program.ValueType },
    implementation: F,
): F => {
    void declaration;
    return implementation;
};
