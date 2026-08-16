// © 2026 Adobe. MIT License. See /LICENSE for details.
import { assert } from "../match/assert.js";
import type { MatchOptions } from "../match/match.js";
import { refifyState, type SchemaSource } from "./refify.js";

// Assert two States are equal UP TO AN ID-BIJECTION: the `expected` State's spec-ids
// (entity map keys, and reference fields found via `source`'s component/resource
// schemas) are refified into correspondence variables, then compared to `actual`.
// The built-in runners (`runFeature`, `runSpec`, …) call this for you; a feature
// with a CUSTOM conformance harness — e.g. one that drives an ECS system frame
// rather than a transaction — uses it directly, passing its store as the schema
// source: `assertState(toState(store), expected, store)`.
export const assertState = (
  actual: unknown,
  expected: unknown,
  source: SchemaSource,
  match?: MatchOptions,
): void => assert(actual, refifyState(expected, source), match);
