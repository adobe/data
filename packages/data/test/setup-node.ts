// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Polyfills for the Node project. ES2024 Set methods (`isSupersetOf`,
// `isSubsetOf`, `isDisjointFrom`, `union`, `intersection`, `difference`,
// `symmetricDifference`) ship in Node 22+ and modern browsers. We polyfill
// them here so the Node test runner works on older Node releases without
// changing the source. The polyfill installs only when the methods are
// missing and is intentionally minimal — production code should run on
// Node 22+.

import { createRequire } from "node:module";

const proto = Set.prototype as Set<unknown>;

if (typeof proto.isSupersetOf !== "function") {
    Object.defineProperty(Set.prototype, "isSupersetOf", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            for (const value of other) {
                if (!this.has(value)) return false;
            }
            return true;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.isSubsetOf !== "function") {
    Object.defineProperty(Set.prototype, "isSubsetOf", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            for (const value of this) {
                if (!other.has(value)) return false;
            }
            return true;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.isDisjointFrom !== "function") {
    Object.defineProperty(Set.prototype, "isDisjointFrom", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            const [smaller, larger] = this.size <= other.size ? [this, other] : [other, this];
            for (const value of smaller) {
                if (larger.has(value)) return false;
            }
            return true;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.union !== "function") {
    Object.defineProperty(Set.prototype, "union", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            const result = new Set(this);
            for (const value of other) result.add(value);
            return result;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.intersection !== "function") {
    Object.defineProperty(Set.prototype, "intersection", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            const result = new Set<unknown>();
            const [smaller, larger] = this.size <= other.size ? [this, other] : [other, this];
            for (const value of smaller) {
                if (larger.has(value)) result.add(value);
            }
            return result;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.difference !== "function") {
    Object.defineProperty(Set.prototype, "difference", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            const result = new Set<unknown>();
            for (const value of this) {
                if (!other.has(value)) result.add(value);
            }
            return result;
        },
        writable: true,
        configurable: true,
    });
}

if (typeof proto.symmetricDifference !== "function") {
    Object.defineProperty(Set.prototype, "symmetricDifference", {
        value(this: Set<unknown>, other: ReadonlySet<unknown>) {
            const result = new Set<unknown>();
            for (const value of this) {
                if (!other.has(value)) result.add(value);
            }
            for (const value of other) {
                if (!this.has(value)) result.add(value);
            }
            return result;
        },
        writable: true,
        configurable: true,
    });
}

// crypto.subtle is available in Node 19+ as globalThis.crypto. For older
// Node we fall back to node:crypto.webcrypto via createRequire to avoid
// top-level await (see CLAUDE.md rule banning TLA).
if (typeof globalThis.crypto === "undefined") {
    const localRequire = createRequire(import.meta.url);
    const { webcrypto } = localRequire("node:crypto") as typeof import("node:crypto");
    Object.defineProperty(globalThis, "crypto", {
        value: webcrypto,
        writable: false,
        configurable: false,
    });
}
