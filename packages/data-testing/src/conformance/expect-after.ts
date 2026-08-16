// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MatchOptions } from "../match/match.js";
import { assertState } from "./assert-state.js";
import type { SchemaSource } from "./refify.js";

// Assert a transform's `after` writes-patch against the actual State. `after` is a
// delta over `before`, so the expectation is `{ ...before, ...after }`, compared up
// to an id-bijection (see `assertState`). Shared by every runner that checks an
// `after` — the pure `runSpec`, and the ecs `runTransactions` / `runActions` — so
// the merge-and-compare contract lives in one place.
export const expectAfter = (
  actual: unknown,
  before: object,
  after: object,
  source: SchemaSource,
  match?: MatchOptions,
): void => assertState(actual, { ...before, ...after }, source, match);
