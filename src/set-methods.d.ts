// © 2026 Adobe. MIT License. See /LICENSE for details.

// src/set-methods.d.ts
/* eslint-disable @typescript-eslint/consistent-type-definitions */

declare global {
    interface Set<T> {
        /** Returns a new set with the elements of `this` ∪ `other`. */
        union<U>(other: Set<U>): Set<T | U>;

        /** Returns a new set with the elements of `this` ∩ `other`. */
        intersection<U>(other: Set<U>): Set<T & U>;

        /** Returns a new set with the elements of `this` ∖ `other`. */
        difference<U>(other: Set<U>): Set<T | U>;

        /** Returns a new set with the elements of `(this ∖ other) ∪ (other ∖ this)`. */
        symmetricDifference<U>(other: Set<U>): Set<T | U>;

        /** `true` if every element of `this` is also in `other`. */
        isSubsetOf<U>(other: Set<U>): boolean;

        /** `true` if every element of `other` is also in `this`. */
        isSupersetOf<U>(other: Set<U>): boolean;

        /** `true` if `this` and `other` share no elements. */
        isDisjointFrom<U>(other: Set<U>): boolean;
    }

    // (Optional) mirror the same methods on ReadonlySet:
    interface ReadonlySet<T> {
        union<U>(other: ReadonlySet<U>): Set<T | U>;
        intersection<U>(other: ReadonlySet<U>): Set<T & U>;
        difference<U>(other: ReadonlySet<U>): Set<T | U>;
        symmetricDifference<U>(other: ReadonlySet<U>): Set<T | U>;
        isSubsetOf<U>(other: ReadonlySet<U>): boolean;
        isSupersetOf<U>(other: ReadonlySet<U>): boolean;
        isDisjointFrom<U>(other: ReadonlySet<U>): boolean;
    }
}

export { };
