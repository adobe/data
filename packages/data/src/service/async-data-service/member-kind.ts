// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";

// The runtime wrapper strategy for a service member, derived from its schema:
// an `observe` value, or a `function` classified by what it returns.
export type WrapKind = "observe" | "fn:observe" | "fn:promise" | "fn:generator" | "fn:void";

// Classify a service member's schema into the runtime wrapper strategy it needs:
// an `observe` value, or a `function` classified by what it returns. Well-typed
// callers can never reach a throw (the caller's schema constraint rejects
// unsupported members at compile time); the throws defend untyped/`any` callers.
// Shared by `createLazy` (local lazy wrapping) and `@adobe/data-rpc` (cross-boundary
// projection) — both drive identical per-member dispatch from the same schema.
export function memberKind(member: Schema): WrapKind {
  if (member.type === "observe") return "observe";
  if (member.type === "function") {
    const returns = member.signature?.returns;
    if (returns === undefined) return "fn:void"; // absent returns ⇒ void
    switch (returns.type) {
      case "observe": return "fn:observe";
      case "promise": return "fn:promise";
      case "generator": return "fn:generator";
      default:
        // A present `returns` with an unrecognized type must not silently become
        // void (that would drop the result); fail loudly instead.
        throw new Error(
          `memberKind: unsupported function returns schema type "${returns.type}" — must be observe, promise, generator, or omitted (void)`,
        );
    }
  }
  throw new Error(
    `memberKind: unsupported member schema type "${member.type}" — service members must be observe or function schemas`,
  );
}
