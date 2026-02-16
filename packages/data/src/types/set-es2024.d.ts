// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Type definitions for ES2024 Set methods that may not be fully typed in TypeScript yet.
 * These methods are part of the ES2024 specification:
 * - Set.prototype.isDisjointFrom()
 * - Set.prototype.isSupersetOf()
 * - Set.prototype.isSubsetOf()
 * - Set.prototype.union()
 * - Set.prototype.intersection()
 * - Set.prototype.difference()
 * - Set.prototype.symmetricDifference()
 */

interface Set<T> {
    /**
     * Returns true if this set has no elements in common with the other set.
     * @param other The other set to check for disjointness
     */
    isDisjointFrom(other: ReadonlySet<T>): boolean;

    /**
     * Returns true if this set is a superset of the other set (contains all elements of other).
     * @param other The other set to check
     */
    isSupersetOf(other: ReadonlySet<T>): boolean;

    /**
     * Returns true if this set is a subset of the other set (all elements are in other).
     * @param other The other set to check
     */
    isSubsetOf(other: ReadonlySet<T>): boolean;

    /**
     * Returns a new set containing all elements from both sets.
     * @param other The other set to union with
     */
    union<U>(other: ReadonlySet<U>): Set<T | U>;

    /**
     * Returns a new set containing only elements that are in both sets.
     * @param other The other set to intersect with
     */
    intersection<U>(other: ReadonlySet<U>): Set<T & U>;

    /**
     * Returns a new set containing elements in this set but not in the other set.
     * @param other The other set to difference with
     */
    difference(other: ReadonlySet<T>): Set<T>;

    /**
     * Returns a new set containing elements in either set but not in both.
     * @param other The other set to symmetric difference with
     */
    symmetricDifference(other: ReadonlySet<T>): Set<T>;
}

interface ReadonlySet<T> {
    /**
     * Returns true if this set has no elements in common with the other set.
     * @param other The other set to check for disjointness
     */
    isDisjointFrom(other: ReadonlySet<T>): boolean;

    /**
     * Returns true if this set is a superset of the other set (contains all elements of other).
     * @param other The other set to check
     */
    isSupersetOf(other: ReadonlySet<T>): boolean;

    /**
     * Returns true if this set is a subset of the other set (all elements are in other).
     * @param other The other set to check
     */
    isSubsetOf(other: ReadonlySet<T>): boolean;
}

