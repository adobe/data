// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Node test setup. ES2024 Set methods (`isSupersetOf`, `isSubsetOf`,
// `isDisjointFrom`, `union`, `intersection`, `difference`,
// `symmetricDifference`) ship in Node 22+. We polyfill them here so the
// node project works on older Node releases without altering source.
// Production users are expected to be on Node 22+ in practice.

const proto = Set.prototype as Set<unknown>;

const define = (name: string, value: (this: Set<unknown>, other: ReadonlySet<unknown>) => unknown): void => {
    if (typeof (proto as Record<string, unknown>)[name] !== "function") {
        Object.defineProperty(Set.prototype, name, { value, writable: true, configurable: true });
    }
};

define("isSupersetOf", function (this, other) {
    for (const value of other) if (!this.has(value)) return false;
    return true;
});

define("isSubsetOf", function (this, other) {
    for (const value of this) if (!other.has(value)) return false;
    return true;
});

define("isDisjointFrom", function (this, other) {
    const [smaller, larger] = this.size <= other.size ? [this, other] : [other, this];
    for (const value of smaller) if (larger.has(value)) return false;
    return true;
});

define("union", function (this, other) {
    const result = new Set(this);
    for (const value of other) result.add(value);
    return result;
});

define("intersection", function (this, other) {
    const result = new Set<unknown>();
    const [smaller, larger] = this.size <= other.size ? [this, other] : [other, this];
    for (const value of smaller) if (larger.has(value)) result.add(value);
    return result;
});

define("difference", function (this, other) {
    const result = new Set<unknown>();
    for (const value of this) if (!other.has(value)) result.add(value);
    return result;
});

define("symmetricDifference", function (this, other) {
    const result = new Set<unknown>();
    for (const value of this) if (!other.has(value)) result.add(value);
    for (const value of other) if (!this.has(value)) result.add(value);
    return result;
});
