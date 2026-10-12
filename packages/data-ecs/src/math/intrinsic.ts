/** A WGSL value type, as `Program.ValueType`. */
type ValueType =
    | "f32" | "i32" | "u32"
    | "vec2f" | "vec3f" | "vec4f" | "vec2i" | "vec3i" | "vec4i" | "vec2u" | "vec3u" | "vec4u"
    | "mat4x4f";

/**
 * Declares the WGSL builtin a math function matches, so GPU kernels emit `wgsl` for calls to it: a function, or with
 * `form`, an operator between or before its operands. Other backends inline `implementation`, which is returned as is.
 * The compiler reads the declaration from source, so it is written as literals.
 */
export const intrinsic = <F>(
    declaration: { readonly wgsl: string; readonly form?: "infix" | "prefix"; readonly parameters: readonly ValueType[]; readonly result: ValueType },
    implementation: F,
): F => {
    void declaration;
    return implementation;
};
