// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "./schema.js";

/**
 * Resolves a `function` schema's untrusted-channel invocation policy
 * (`schema.external`) into plain booleans, applying the two channels' opposite
 * default polarity in ONE place so call sites never re-derive it (getting the
 * `=== true` vs `!== false` polarity wrong on the link channel would be a
 * security hole):
 *
 * - `link` — the least-trusted channel (a deeplink / URL anyone can craft and get
 *   a victim to open in their authenticated session). Default-DENY whitelist:
 *   invocable only when `external.link === true`.
 * - `agent` — acting on the user's behalf, more trusted. Default-ALLOW blacklist:
 *   invocable unless `external.agent === false`.
 *
 * Safe to call on any schema; a schema without a policy resolves to the defaults
 * (link denied, agent allowed).
 */
export function resolveExternalInvocation(schema: Schema): { readonly link: boolean; readonly agent: boolean } {
  const external = schema.signature?.external;
  return {
    link: external?.link === true,
    agent: external?.agent !== false,
  };
}
