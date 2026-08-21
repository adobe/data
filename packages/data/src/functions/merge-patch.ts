// © 2026 Adobe. MIT License. See /LICENSE for details.
export type Patch<T> =
    | (T extends readonly any[]
        ? T                                   // arrays must be same array type
        : T extends object
        ? { [K in keyof T]?: Patch<T[K]> | null } // objects are partial; null deletes
        : T)                                  // scalars replace
    | null;

/**
 * A merge patch whose delete sentinel is `undefined` instead of `null`, so `null`
 * survives as a real value. Objects are partial; setting a key to `undefined`
 * deletes it. Arrays and scalars replace. See {@link mergePatchU}.
 */
export type PatchU<T> =
    T extends readonly any[]
        ? T // arrays replace wholesale
        : T extends object
        ? { [K in keyof T]?: PatchU<T[K]> } // objects are partial; a key set to `undefined` deletes it
        : T; // scalars (incl. null) replace

/**
 * Executes a JSON Merge Patch (RFC 7396) on `target` with `patch`.
 * - Objects: recursively merge; `null` deletes a property.
 * - Arrays: replaced wholesale (no element-wise merge).
 * - Primitives: replaced.
 * Does NOT mutate the input objects or arrays.
 */
export function mergePatch<T>(target: T, patch: Patch<T>): T {
    return mergePatchWith(target, patch, null);
}

/**
 * JSON Merge Patch with the delete sentinel moved from `null` to `undefined`, so
 * `null` is a preservable value (e.g. `default: null` sets the default to null
 * rather than deleting it). Not RFC 7396 (which is {@link mergePatch}) — `undefined`
 * is not serializable, which is fine here because these patches are never serialized.
 * - Objects: recursively merge; a key whose value is `undefined` is deleted.
 * - Arrays: replaced wholesale (no element-wise merge).
 * - Primitives (including `null`): replace.
 * Does NOT mutate the inputs.
 */
export function mergePatchU<T>(target: T, patch: PatchU<T>): T {
    return mergePatchWith(target, patch, undefined);
}

// Shared merge-patch algorithm; `sentinel` is the value that DELETES a key
// (`null` for RFC 7396, `undefined` for the {@link mergePatchU} variant).
function mergePatchWith<T>(target: T, patch: unknown, sentinel: null | undefined): T {
    // Arrays and non-objects (scalars, and the sentinel itself at the top) replace.
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
        return patch as T;
    }
    // An object patch merges onto an object target; onto anything else it builds fresh.
    const base = target !== null && typeof target === "object" && !Array.isArray(target) ? (target as Record<string, unknown>) : {};
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(patch)) {
        const value = (patch as Record<string, unknown>)[key];
        if (value === sentinel) {
            delete result[key];
        } else {
            result[key] = mergePatchWith(base[key], value, sentinel);
        }
    }
    return result as T;
}
