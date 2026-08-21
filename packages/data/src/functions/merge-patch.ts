// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A merge patch over `T`: objects are partial and merge recursively; arrays and
 * scalars replace wholesale. Deletion is expressed at RUNTIME by setting a key to
 * the delete sentinel passed to {@link mergePatch} (default `undefined`), not in the
 * type — so `null` is an ordinary value unless you opt into it as the sentinel.
 */
export type Patch<T> =
    T extends readonly any[]
        ? T // arrays replace wholesale
        : T extends object
        ? { [K in keyof T]?: Patch<T[K]> }
        : T; // scalars (incl. null) replace

/**
 * Executes a JSON Merge Patch (RFC 7396-style) on `target` with `patch`:
 * - Objects: recursively merge; a key set to `deleteSentinel` is deleted.
 * - Arrays: replaced wholesale (no element-wise merge).
 * - Primitives: replace.
 * Does NOT mutate the inputs.
 *
 * `deleteSentinel` is the value that DELETES a key. It defaults to `undefined`, so
 * `null` survives as an ordinary value (e.g. `default: null` sets the default to
 * null). Pass `null` for strict RFC 7396, where `null` deletes instead. `undefined`
 * is not serializable, which is fine for patches that are never serialized.
 */
export function mergePatch<T>(target: T, patch: Patch<T>, deleteSentinel: null | undefined = undefined): T {
    // Arrays and non-objects (scalars, and the sentinel itself at the top) replace.
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
        return patch as T;
    }
    // An object patch merges onto an object target; onto anything else it builds fresh.
    const base = target !== null && typeof target === "object" && !Array.isArray(target) ? (target as Record<string, unknown>) : {};
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(patch)) {
        const value = (patch as Record<string, unknown>)[key];
        if (value === deleteSentinel) {
            delete result[key];
        } else {
            result[key] = mergePatch(base[key], value as Patch<unknown>, deleteSentinel);
        }
    }
    return result as T;
}
